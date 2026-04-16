export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { parseRevenueReport, parseRevenueFromRows } from '@/lib/parsers/revenue-parser';

export async function POST(request: Request) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['HEAD_OF_CLAIMS', 'TEAM_LEADER'].includes(ctx.role))
      return Response.json({ error: 'Forbidden' }, { status: 403 });

    const contentType = request.headers.get('content-type') ?? '';

    // ── Chunked JSON upload (large files parsed client-side) ──
    if (contentType.includes('application/json')) {
      let json: {
        rows: Record<string, unknown>[];
        chunk: number;
        totalChunks: number;
        filename?: string;
        importRunId?: string;
      };
      try {
        json = await request.json();
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
      }

      const { rows: rawRows, chunk, totalChunks, filename, importRunId: existingRunId } = json;

      let parseResult: Awaited<ReturnType<typeof parseRevenueFromRows>>;
      try {
        parseResult = parseRevenueFromRows(rawRows ?? []);
      } catch (err) {
        return Response.json({ error: 'Failed to process rows', detail: String(err) }, { status: 422 });
      }
      const { rows, periodDate } = parseResult;

      let importRunId = existingRunId;

      // First chunk: create ImportRun and clear existing data for this period
      if (chunk === 0) {
        if (!(periodDate instanceof Date) || isNaN(periodDate.getTime())) {
          return Response.json(
            { error: 'Could not determine report period. Ensure the Month column contains valid dates.' },
            { status: 422 },
          );
        }
        const importRun = await prisma.importRun.create({
          data: {
            reportType: 'REVENUE_ANALYSIS',
            filename: filename ?? 'unknown',
            uploadedBy: ctx.userId,
            rowsRead: 0, // updated on last chunk
            periodStart: periodDate,
            periodEnd: periodDate,
          },
        });
        importRunId = importRun.id;
        await prisma.premiumRecord.deleteMany({ where: { periodDate } });
      }

      if (!importRunId) {
        return Response.json({ error: 'Missing importRunId for non-first chunk' }, { status: 400 });
      }

      // Insert this chunk's rows
      let chunkCreated = 0;
      let chunkErrored = 0;
      const SQL_CHUNK = 500;

      for (let i = 0; i < rows.length; i += SQL_CHUNK) {
        const sqlChunk = rows.slice(i, i + SQL_CHUNK);
        if (!sqlChunk.length) continue;
        try {
          const values = sqlChunk.map(r => Prisma.sql`(
            gen_random_uuid(),
            ${importRunId}::uuid,
            ${r.month},
            ${r.periodDate}::date,
            ${r.branch},
            ${r.classCode},
            ${r.className},
            ${r.product},
            ${r.broker},
            ${r.policyNumber},
            ${r.insured},
            ${r.uwYear}::int,
            ${r.endorsementType},
            ${r.gwp}::decimal,
            ${r.netWp}::decimal,
            ${r.quotaShareWp}::decimal,
            ${r.gwpVat}::decimal,
            ${r.grossComm}::decimal,
            ${r.netComm}::decimal,
            ${r.grossCommPct}::decimal
          )`);
          await prisma.$executeRaw`
            INSERT INTO premium_records (
              id, import_run_id, month, period_date,
              branch, class_code, class_name, product,
              broker, policy_number, insured, uw_year,
              endorsement_type, gwp, net_wp, quota_share_wp,
              gwp_vat, gross_comm, net_comm, gross_comm_pct
            ) VALUES ${Prisma.join(values)}
          `;
          chunkCreated += sqlChunk.length;
        } catch (err) {
          console.error(`[revenue-import] SQL chunk failed:`, err);
          chunkErrored += sqlChunk.length;
        }
      }

      // Last chunk: update ImportRun with final row count
      if (chunk === totalChunks - 1) {
        await prisma.importRun.update({
          where: { id: importRunId },
          data: { rowsCreated: chunkCreated, rowsErrored: chunkErrored },
        });
      }

      return Response.json({ success: true, importRunId, chunkCreated, chunkErrored, chunk });
    }

    // ── Standard FormData upload (small files / fallback) ──
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return Response.json({ error: 'Invalid form data' }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    let parseResult: Awaited<ReturnType<typeof parseRevenueReport>>;
    try {
      parseResult = parseRevenueReport(buffer);
    } catch (err) {
      return Response.json({ error: 'Failed to parse file', detail: String(err) }, { status: 422 });
    }

    const { rows, periodDate } = parseResult;

    if (rows.length === 0) {
      return Response.json(
        { error: 'No data rows found in file. Check the file format matches the expected revenue report template.' },
        { status: 422 },
      );
    }

    if (!(periodDate instanceof Date) || isNaN(periodDate.getTime())) {
      return Response.json(
        { error: 'Could not determine report period from file. Ensure the Month column contains valid dates.' },
        { status: 422 },
      );
    }

    const importRun = await prisma.importRun.create({
      data: {
        reportType: 'REVENUE_ANALYSIS',
        filename: file.name,
        uploadedBy: ctx.userId,
        rowsRead: rows.length,
        periodStart: periodDate,
        periodEnd: periodDate,
      },
    });

    await prisma.premiumRecord.deleteMany({ where: { periodDate } });

    const SQL_CHUNK = 500;
    let created = 0;
    let errored = 0;
    let firstChunkError: string | null = null;

    for (let i = 0; i < rows.length; i += SQL_CHUNK) {
      const chunk = rows.slice(i, i + SQL_CHUNK);
      if (!chunk.length) continue;
      try {
        const values = chunk.map(r => Prisma.sql`(
          gen_random_uuid(),
          ${importRun.id}::uuid,
          ${r.month},
          ${r.periodDate}::date,
          ${r.branch},
          ${r.classCode},
          ${r.className},
          ${r.product},
          ${r.broker},
          ${r.policyNumber},
          ${r.insured},
          ${r.uwYear}::int,
          ${r.endorsementType},
          ${r.gwp}::decimal,
          ${r.netWp}::decimal,
          ${r.quotaShareWp}::decimal,
          ${r.gwpVat}::decimal,
          ${r.grossComm}::decimal,
          ${r.netComm}::decimal,
          ${r.grossCommPct}::decimal
        )`);
        await prisma.$executeRaw`
          INSERT INTO premium_records (
            id, import_run_id, month, period_date,
            branch, class_code, class_name, product,
            broker, policy_number, insured, uw_year,
            endorsement_type, gwp, net_wp, quota_share_wp,
            gwp_vat, gross_comm, net_comm, gross_comm_pct
          ) VALUES ${Prisma.join(values)}
        `;
        created += chunk.length;
      } catch (chunkErr) {
        const msg = chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
        if (!firstChunkError) firstChunkError = msg;
        console.error(`[revenue-import] chunk ${i}–${i + chunk.length} failed:`, msg);
        errored += chunk.length;
      }
    }

    await prisma.importRun.update({
      where: { id: importRun.id },
      data: { rowsCreated: created, rowsErrored: errored },
    });

    return Response.json({
      success: true,
      rowsRead: rows.length,
      rowsCreated: created,
      rowsUpdated: 0,
      rowsErrored: errored,
      snapshotDate: periodDate.toISOString().split('T')[0],
      ...(firstChunkError ? { warning: `Some chunks failed: ${firstChunkError}` } : {}),
    });
  } catch (err) {
    console.error('[revenue-import]', err);
    return Response.json(
      { error: 'Import failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
