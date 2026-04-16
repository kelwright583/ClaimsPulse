export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { parseRevenueReport } from '@/lib/parsers/revenue-parser';

export async function POST(request: Request) {
  try {
  const ctx = await getSessionContext();
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['HEAD_OF_CLAIMS', 'TEAM_LEADER'].includes(ctx.role))
    return Response.json({ error: 'Forbidden' }, { status: 403 });

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

  // Delete existing records for this period before re-importing.
  // PremiumRecord has no unique constraint so re-imports would create duplicates without this.
  await prisma.premiumRecord.deleteMany({ where: { periodDate } });

  // Chunk at 2,000 rows (2,000 × 19 cols = 38,000 params — well under PostgreSQL's 65,535 limit).
  // A single createMany with 71k rows exceeds the limit and always crashes.
  const CHUNK = 2000;
  let created = 0;
  let errored = 0;
  let firstChunkError: string | null = null;

  const buildPremiumData = (row: (typeof rows)[number]) => ({
    importRunId: importRun.id,
    month: row.month,
    periodDate: row.periodDate,
    branch: row.branch,
    classCode: row.classCode,
    className: row.className,
    product: row.product,
    broker: row.broker,
    policyNumber: row.policyNumber,
    insured: row.insured,
    uwYear: row.uwYear,
    endorsementType: row.endorsementType,
    gwp: row.gwp,
    netWp: row.netWp,
    quotaShareWp: row.quotaShareWp,
    gwpVat: row.gwpVat,
    grossComm: row.grossComm,
    netComm: row.netComm,
    grossCommPct: row.grossCommPct,
  });

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    try {
      const result = await prisma.premiumRecord.createMany({
        data: chunk.map(buildPremiumData),
        skipDuplicates: true,
      });
      created += result.count;
    } catch (chunkErr) {
      const msg = chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
      if (!firstChunkError) firstChunkError = msg;
      console.error(`[revenue-import] chunk ${i}–${i + chunk.length} failed:`, msg);
      // Row-by-row fallback for this chunk
      for (const row of chunk) {
        try {
          await prisma.premiumRecord.create({ data: buildPremiumData(row) });
          created++;
        } catch {
          errored++;
        }
      }
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
