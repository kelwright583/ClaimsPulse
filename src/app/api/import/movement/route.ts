export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { parseMovementReport } from '@/lib/parsers/movement-parser';

export async function POST(request: Request) {
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

  for (const row of rows) {
    try {
      const existing = await prisma.financialSummary.findUnique({
        where: {
          periodDate_section_level_metric: {
            periodDate: row.periodDate,
            section: row.section,
            level: row.level,
            metric: row.metric,
          },
        },
      });

      if (existing) {
        await prisma.financialSummary.update({
          where: { id: existing.id },
          data: { value: row.value, importRunId: importRun.id },
        });
        updated++;
      } else {
        await prisma.financialSummary.create({
          data: {
            importRunId: importRun.id,
            period: row.period,
            periodDate: row.periodDate,
            section: row.section,
            level: row.level,
            metric: row.metric,
            value: row.value,
          },
        });
        created++;
      }
    } catch {
      errored++;
    }
  }

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
}
