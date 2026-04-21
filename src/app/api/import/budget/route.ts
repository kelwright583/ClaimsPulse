export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { type Prisma, ReportType } from '@prisma/client';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { parseBudgetReport } from '@/lib/parsers/budget-parser';

export async function POST(request: Request) {
  try {
    // ------------------------------------------------------------------
    // Auth — HEAD_OF_CLAIMS or SENIOR_MANAGEMENT only
    // ------------------------------------------------------------------
    const ctx = await getSessionContext();
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['HEAD_OF_CLAIMS', 'SENIOR_MANAGEMENT'].includes(ctx.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ------------------------------------------------------------------
    // Form data
    // ------------------------------------------------------------------
    let formData: FormData;
    try { formData = await request.formData(); }
    catch { return Response.json({ error: 'Invalid form data' }, { status: 400 }); }

    const file = formData.get('file') as File | null;
    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

    // Optional uwYear query param for cross-check / fallback
    const url = new URL(request.url);
    const uwYearParam = url.searchParams.get('uwYear');
    const confirmedUwYear = uwYearParam ? parseInt(uwYearParam, 10) : undefined;

    // ------------------------------------------------------------------
    // Parse
    // ------------------------------------------------------------------
    const buffer = await file.arrayBuffer();

    let parseResult: ReturnType<typeof parseBudgetReport>;
    try {
      parseResult = parseBudgetReport(buffer, confirmedUwYear);
    } catch (err) {
      return Response.json(
        { error: 'Failed to parse budget file', detail: String(err) },
        { status: 422 },
      );
    }

    const { uwYear, sheetUsed, rows, warnings } = parseResult;

    // ------------------------------------------------------------------
    // DB transaction: upsert Targets, replace MonthlyBudgets, create ImportRun
    // ------------------------------------------------------------------
    let rowsCreated = 0;

    await prisma.$transaction(async (tx) => {
      // 1. Upsert annual Target rows (4 metrics, productLine = null)
      // Note: Prisma unique-where with a nullable column requires deleteMany + create pattern
      // for the null case, as null != null in SQL unique indexes.
      for (const row of rows) {
        const existing = await tx.target.findFirst({
          where: { metricType: row.metricType, productLine: null, uwYear },
        });
        if (existing) {
          await tx.target.update({
            where: { id: existing.id },
            data: { annualTarget: row.annualTotal, setBy: ctx.userId },
          });
        } else {
          await tx.target.create({
            data: {
              metricType:   row.metricType,
              productLine:  null,
              uwYear,
              annualTarget: row.annualTotal,
              setBy:        ctx.userId,
            },
          });
        }
      }

      // 2. Delete existing MonthlyBudget rows for (uwYear, productLine=null)
      await tx.monthlyBudget.deleteMany({
        where: { uwYear, productLine: null },
      });

      // 3. Create ImportRun first so we have an id for monthlyBudgets
      const importRun = await tx.importRun.create({
        data: {
          reportType:  'BUDGET' as ReportType,
          filename:    file.name,
          uploadedBy:  ctx.userId,
          rowsRead:    rows.length,
          rowsCreated: 0, // updated below
          rowsUpdated: 0,
        },
      });

      // 4. Re-insert 48 MonthlyBudget rows (4 metrics × 12 months)
      const monthlyRows: Prisma.MonthlyBudgetCreateManyInput[] = [];

      for (const row of rows) {
        for (const m of row.monthly) {
          monthlyRows.push({
            uwYear,
            productLine:  null,
            metricType:   row.metricType,
            monthIndex:   m.monthIndex,
            monthLabel:   m.monthLabel,
            budgetValue:  m.value,
            sourceFile:   file.name,
            importRunId:  importRun.id,
            setBy:        ctx.userId,
          });
        }
      }

      await tx.monthlyBudget.createMany({ data: monthlyRows });
      rowsCreated = monthlyRows.length;

      // Update ImportRun with final counts
      await tx.importRun.update({
        where: { id: importRun.id },
        data:  { rowsCreated, errorsJson: warnings.length > 0 ? warnings : undefined },
      });
    });

    return Response.json({
      success:     true,
      uwYear,
      sheetUsed,
      rowsCreated,
      warnings:    warnings.length > 0 ? warnings : [],
    });

  } catch (err) {
    console.error('[budget import]', err);
    const msg = err instanceof Error ? err.message : 'Internal error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
