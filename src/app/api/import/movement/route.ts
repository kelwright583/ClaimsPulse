export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { parseMovementReport } from '@/lib/parsers/movement-parser';

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

  let parseResult: Awaited<ReturnType<typeof parseMovementReport>>;
  try {
    parseResult = parseMovementReport(buffer);
  } catch (err) {
    return Response.json({ error: 'Failed to parse file', detail: String(err) }, { status: 422 });
  }

  const { rows, periodDate, period } = parseResult;

  const importRun = await prisma.importRun.create({
    data: {
      reportType: 'MOVEMENT_SUMMARY',
      filename: file.name,
      uploadedBy: ctx.userId,
      rowsRead: rows.length,
      periodStart: periodDate,
      periodEnd: periodDate,
    },
  });

  let created = 0;
  let updated = 0;
  let errored = 0;

  // All rows share the same periodDate — fetch existing records in one query
  const existing = await prisma.financialSummary.findMany({
    where: { periodDate },
    select: { id: true, section: true, level: true, metric: true },
  });
  const existingMap = new Map(
    existing.map(r => [`${r.section}:${r.level}:${r.metric}`, r.id])
  );

  const toCreate = rows.filter(r => !existingMap.has(`${r.section}:${r.level}:${r.metric}`));
  const toUpdate = rows
    .filter(r => existingMap.has(`${r.section}:${r.level}:${r.metric}`))
    .map(r => ({ id: existingMap.get(`${r.section}:${r.level}:${r.metric}`)!, row: r }));

  // Bulk insert new rows
  if (toCreate.length > 0) {
    try {
      const result = await prisma.financialSummary.createMany({
        data: toCreate.map(row => ({
          importRunId: importRun.id,
          period: row.period,
          periodDate: row.periodDate,
          section: row.section,
          level: row.level,
          metric: row.metric,
          value: row.value,
        })),
        skipDuplicates: true,
      });
      created = result.count;
    } catch {
      errored += toCreate.length;
    }
  }

  // Update existing rows in parallel
  await Promise.all(
    toUpdate.map(async ({ id, row }) => {
      try {
        await prisma.financialSummary.update({
          where: { id },
          data: { value: row.value, importRunId: importRun.id },
        });
        updated++;
      } catch {
        errored++;
      }
    })
  );

  await prisma.importRun.update({
    where: { id: importRun.id },
    data: { rowsCreated: created, rowsUpdated: updated, rowsErrored: errored },
  });

  return Response.json({
    success: true,
    rowsRead: rows.length,
    rowsCreated: created,
    rowsUpdated: updated,
    rowsErrored: errored,
    snapshotDate: periodDate.toISOString().split('T')[0],
  });
  } catch (err) {
    console.error('[movement-import]', err);
    return Response.json(
      { error: 'Import failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
