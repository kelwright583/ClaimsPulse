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

  const { rows, periodDate, month } = parseResult;

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

  let created = 0;
  let errored = 0;

  for (const row of rows) {
    try {
      await prisma.premiumRecord.create({
        data: {
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
        },
      });
      created++;
    } catch {
      errored++;
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
  });
  } catch (err) {
    console.error('[revenue-import]', err);
    return Response.json(
      { error: 'Import failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
