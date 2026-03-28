import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

const ALLOWED_ROLES = ['SENIOR_MANAGEMENT', 'HEAD_OF_CLAIMS'] as const;

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period'); // e.g. '2025-03'
    const netGross = searchParams.get('netGross') ?? 'net'; // 'net' | 'gross'

    // Check if financial summary data exists
    const financialCount = await prisma.financialSummary.count();
    const hasMovementData = financialCount > 0;

    // Get latest snapshot date
    const latestSnap = await prisma.$queryRaw<{ max_date: Date | null }[]>`
      SELECT MAX(snapshot_date) AS max_date FROM claim_snapshots
    `;
    const snapshotDate = latestSnap[0]?.max_date ?? new Date();

    // Headlines
    const ibnrRecord = await prisma.financialSummary.findFirst({
      where: { metric: 'ibnr_balance' },
      orderBy: { periodDate: 'desc' },
    });
    const sasriaRecord = await prisma.financialSummary.findFirst({
      where: { metric: 'sasria_exposure' },
      orderBy: { periodDate: 'desc' },
    });

    // UW result = netWp - totalIncurred
    const premiumAgg = await prisma.premiumRecord.aggregate({ _sum: { netWp: true } });
    const incurredAgg = await prisma.claimSnapshot.aggregate({
      where: { snapshotDate },
      _sum: { totalIncurred: true },
    });
    const totalNetWp = premiumAgg._sum.netWp ? Number(premiumAgg._sum.netWp) : null;
    const totalIncurred = incurredAgg._sum.totalIncurred ? Number(incurredAgg._sum.totalIncurred) : null;
    const uwResult = totalNetWp !== null && totalIncurred !== null ? totalNetWp - totalIncurred : null;

    // Reserve movement MTD
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const currentMonthOs = await prisma.claimSnapshot.aggregate({
      where: { snapshotDate: { gte: monthStart } },
      _sum: { totalOs: true },
    });
    const prevMonthOs = await prisma.claimSnapshot.aggregate({
      where: { snapshotDate: { gte: prevMonthStart, lte: prevMonthEnd } },
      _sum: { totalOs: true },
    });
    const reserveMovementMtd = (currentMonthOs._sum.totalOs ? Number(currentMonthOs._sum.totalOs) : 0)
      - (prevMonthOs._sum.totalOs ? Number(prevMonthOs._sum.totalOs) : 0);

    // Monthly trend (last 12 months)
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const monthlyIncurredRaw = await prisma.$queryRaw<{ month: string; total_incurred: string }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', snapshot_date), 'YYYY-MM') AS month,
             SUM(total_incurred)::text AS total_incurred
      FROM claim_snapshots
      WHERE snapshot_date >= ${twelveMonthsAgo}
      GROUP BY DATE_TRUNC('month', snapshot_date)
      ORDER BY DATE_TRUNC('month', snapshot_date)
    `;

    const monthlyPremiumRaw = await prisma.$queryRaw<{ month: string; net_wp: string }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', period_date), 'YYYY-MM') AS month,
             SUM(net_wp)::text AS net_wp
      FROM premium_records
      WHERE period_date >= ${twelveMonthsAgo}
      GROUP BY DATE_TRUNC('month', period_date)
      ORDER BY DATE_TRUNC('month', period_date)
    `;

    const premiumByMonth = new Map(monthlyPremiumRaw.map(r => [r.month, parseFloat(r.net_wp ?? '0')]));

    // Targets for loss ratio
    const lossRatioTargets = await prisma.target.findMany({
      where: { metricType: 'loss_ratio' },
      orderBy: { uwYear: 'desc' },
      take: 1,
    });
    const targetLossRatio = lossRatioTargets[0] ? Number(lossRatioTargets[0].annualTarget) : null;

    const monthlyTrend = monthlyIncurredRaw.map(r => {
      const incurred = parseFloat(r.total_incurred ?? '0');
      const nwp = premiumByMonth.get(r.month) ?? 0;
      const lossRatio = nwp > 0 ? (incurred / nwp) * 100 : null;
      return {
        month: r.month,
        incurred,
        lossRatio,
        targetLossRatio,
      };
    });

    // IBNR movement
    const ibnrRecords = await prisma.financialSummary.findMany({
      where: { metric: 'ibnr_balance' },
      orderBy: { periodDate: 'asc' },
    });

    const ibnrByPeriod = new Map<string, number[]>();
    for (const r of ibnrRecords) {
      const key = r.period;
      if (!ibnrByPeriod.has(key)) ibnrByPeriod.set(key, []);
      ibnrByPeriod.get(key)!.push(Number(r.value));
    }

    const ibnrMovement = Array.from(ibnrByPeriod.entries()).map(([p, values]) => {
      const ibnrOpen = values[0] ?? 0;
      const ibnrClose = values[values.length - 1] ?? 0;
      const movement = ibnrClose - ibnrOpen;
      // Alert if movement > 5% of an estimated earned premium (simplified: > 5% of 10M as placeholder)
      const isAlert = Math.abs(movement) > 500000;
      return { period: p, ibnrOpen, ibnrClose, movement, isAlert };
    });

    // SASRIA
    const sasriaGross = await prisma.financialSummary.findFirst({
      where: { metric: 'sasria_gross_premium' },
      orderBy: { periodDate: 'desc' },
    });
    const sasriaComm = await prisma.financialSummary.findFirst({
      where: { metric: 'sasria_commission' },
      orderBy: { periodDate: 'desc' },
    });
    const sasriaDueBroker = await prisma.financialSummary.findFirst({
      where: { metric: 'sasria_due_from_broker' },
      orderBy: { periodDate: 'desc' },
    });
    const sasriaDueSasria = await prisma.financialSummary.findFirst({
      where: { metric: 'sasria_due_to_sasria' },
      orderBy: { periodDate: 'desc' },
    });

    const sasria = sasriaRecord ? {
      grossPremium: sasriaGross ? Number(sasriaGross.value) : null,
      commission: sasriaComm ? Number(sasriaComm.value) : null,
      dueFromBroker: sasriaDueBroker ? Number(sasriaDueBroker.value) : null,
      dueToSasria: sasriaDueSasria ? Number(sasriaDueSasria.value) : null,
    } : null;

    // Suppress unused params
    void period;
    void netGross;

    return NextResponse.json({
      hasMovementData,
      headlines: {
        uwResult,
        ibnrBalance: ibnrRecord ? Number(ibnrRecord.value) : null,
        sasriaExposure: sasriaRecord ? Number(sasriaRecord.value) : null,
        reserveMovementMtd,
      },
      monthlyTrend,
      ibnrMovement,
      sasria,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
