import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reference/monthly-budgets?uwYear={uwYear}
 *
 * Returns all MonthlyBudget rows for the given uwYear where productLine IS NULL
 * (i.e., aggregate/total budget rows, not per-product-line breakdowns).
 *
 * Shape: Array<{ metricType, monthLabel, monthIndex, budgetValue, uwYear }>
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const uwYearParam = searchParams.get('uwYear');
    if (!uwYearParam) {
      return NextResponse.json({ error: 'uwYear query param is required' }, { status: 400 });
    }

    const uwYear = parseInt(uwYearParam, 10);
    if (isNaN(uwYear)) {
      return NextResponse.json({ error: 'Invalid uwYear' }, { status: 400 });
    }

    const rows = await prisma.monthlyBudget.findMany({
      where: {
        uwYear,
        productLine: null,
      },
      orderBy: [{ metricType: 'asc' }, { monthIndex: 'asc' }],
    });

    return NextResponse.json(
      rows.map(r => ({
        metricType: r.metricType,
        monthLabel: r.monthLabel,
        monthIndex: r.monthIndex,
        budgetValue: r.budgetValue.toNumber(),
        uwYear: r.uwYear,
      }))
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
