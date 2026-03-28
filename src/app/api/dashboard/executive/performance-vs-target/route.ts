import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

const ALLOWED_ROLES = ['SENIOR_MANAGEMENT', 'HEAD_OF_CLAIMS'] as const;

function getFinancialYearStart(): Date {
  const now = new Date();
  return now.getMonth() >= 9
    ? new Date(now.getFullYear(), 9, 1)
    : new Date(now.getFullYear() - 1, 9, 1);
}

function monthsElapsedSince(from: Date): number {
  const now = new Date();
  return (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth()) + 1;
}

function getStatus(actual: number, target: number, lowerIsBetter: boolean): 'green' | 'amber' | 'red' {
  if (lowerIsBetter) {
    if (actual < target) return 'green';
    if (actual < target + 5) return 'amber';
    return 'red';
  } else {
    if (actual >= target) return 'green';
    if (actual >= target * 0.95) return 'amber';
    return 'red';
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const productLine = searchParams.get('productLine');
    const uwYearParam = searchParams.get('uwYear');

    const fyStart = getFinancialYearStart();
    const currentUwYear = uwYearParam ? parseInt(uwYearParam, 10) : fyStart.getFullYear();
    const monthsElapsed = monthsElapsedSince(fyStart);

    // Get targets
    const targets = await prisma.target.findMany({
      where: {
        uwYear: currentUwYear,
        ...(productLine ? { productLine } : {}),
      },
    });
    const hasTargets = targets.length > 0;

    const targetMap = new Map(targets.map(t => [`${t.metricType}::${t.productLine ?? 'ALL'}`, Number(t.annualTarget)]));

    // Latest snapshot date
    const latestSnap = await prisma.$queryRaw<{ max_date: Date | null }[]>`
      SELECT MAX(snapshot_date) AS max_date FROM claim_snapshots
    `;
    const snapshotDate = latestSnap[0]?.max_date ?? new Date();

    // Get claims incurred (YTD)
    const incurredResult = await prisma.claimSnapshot.aggregate({
      where: {
        snapshotDate,
        ...(productLine ? { productLine: { contains: productLine, mode: 'insensitive' } } : {}),
      },
      _sum: { totalIncurred: true },
    });
    const totalIncurred = incurredResult._sum.totalIncurred ? Number(incurredResult._sum.totalIncurred) : 0;

    // Premium data
    const premiumResult = await prisma.premiumRecord.aggregate({
      where: {
        periodDate: { gte: fyStart },
        ...(productLine ? { className: { contains: productLine, mode: 'insensitive' } } : {}),
      },
      _sum: { netWp: true },
      _count: { policyNumber: true },
    });
    const totalNetWp = premiumResult._sum.netWp ? Number(premiumResult._sum.netWp) : null;
    const policyCountActual = premiumResult._count.policyNumber;

    const lossRatioActual = totalNetWp && totalNetWp > 0 ? (totalIncurred / totalNetWp) * 100 : null;
    const lossRatioTarget = targetMap.get(`loss_ratio::${productLine ?? 'ALL'}`) ?? null;
    const lossRatioProjectedYE = lossRatioActual && monthsElapsed > 0
      ? (lossRatioActual / monthsElapsed) * 12
      : null;
    const lossRatioRequiredMonthly = lossRatioTarget && monthsElapsed < 12
      ? (lossRatioTarget * 12 - (lossRatioActual ?? 0) * monthsElapsed) / (12 - monthsElapsed)
      : null;

    const netWpTarget = targetMap.get(`net_wp::${productLine ?? 'ALL'}`) ?? null;
    const netWpProjectedYE = totalNetWp && monthsElapsed > 0 ? (totalNetWp / monthsElapsed) * 12 : null;
    const netWpRequiredMonthly = netWpTarget && monthsElapsed < 12
      ? (netWpTarget * 12 - (totalNetWp ?? 0)) / (12 - monthsElapsed)
      : null;

    const policyTarget = targetMap.get(`policy_count::${productLine ?? 'ALL'}`) ?? null;
    const policyProjectedYE = policyCountActual && monthsElapsed > 0 ? (policyCountActual / monthsElapsed) * 12 : null;
    const policyRequiredMonthly = policyTarget && monthsElapsed < 12
      ? (policyTarget * 12 - (policyCountActual ?? 0)) / (12 - monthsElapsed)
      : null;

    // By product line
    const productLines = await prisma.claimSnapshot.groupBy({
      by: ['productLine'],
      where: { snapshotDate },
      _sum: { totalIncurred: true },
      _count: { claimId: true },
    });

    const byProductLine = await Promise.all(
      productLines.map(async (pl) => {
        const plName = pl.productLine ?? 'Unknown';
        const plIncurred = pl._sum.totalIncurred ? Number(pl._sum.totalIncurred) : 0;
        const plPremium = await prisma.premiumRecord.aggregate({
          where: {
            periodDate: { gte: fyStart },
            className: { contains: plName, mode: 'insensitive' },
          },
          _sum: { netWp: true },
        });
        const plNetWp = plPremium._sum.netWp ? Number(plPremium._sum.netWp) : null;
        const plLossRatio = plNetWp && plNetWp > 0 ? (plIncurred / plNetWp) * 100 : null;
        const plTarget = targetMap.get(`loss_ratio::${plName}`) ?? lossRatioTarget;
        return {
          productLine: plName,
          lossRatioActual: plLossRatio,
          lossRatioTarget: plTarget,
          totalIncurred: plIncurred,
          netWp: plNetWp,
          claimCount: pl._count.claimId,
          status: plLossRatio && plTarget ? getStatus(plLossRatio, plTarget, true) : 'green' as const,
        };
      })
    );

    return NextResponse.json({
      hasTargets,
      lossRatio: {
        actual: lossRatioActual,
        target: lossRatioTarget,
        projectedYE: lossRatioProjectedYE,
        requiredMonthly: lossRatioRequiredMonthly,
        status: lossRatioActual && lossRatioTarget ? getStatus(lossRatioActual, lossRatioTarget, true) : null,
      },
      netWp: {
        actualMtd: totalNetWp,
        target: netWpTarget,
        projectedYE: netWpProjectedYE,
        requiredMonthly: netWpRequiredMonthly,
        status: totalNetWp && netWpTarget ? getStatus(totalNetWp, netWpTarget, false) : null,
      },
      policyCount: {
        actual: policyCountActual,
        target: policyTarget,
        projectedYE: policyProjectedYE,
        requiredMonthly: policyRequiredMonthly,
        status: policyCountActual && policyTarget ? getStatus(policyCountActual, Number(policyTarget), false) : null,
      },
      byProductLine,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
