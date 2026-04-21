import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { getFyBoundaries } from '@/lib/fiscal';

const ALLOWED_ROLES = ['SENIOR_MANAGEMENT', 'HEAD_OF_CLAIMS'] as const;

export async function GET(_request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const premiumCount = await prisma.premiumRecord.count();
    const hasRevenueData = premiumCount > 0;

    // NWP targets
    const nwpTargetRecord = await prisma.target.findFirst({
      where: { metricType: 'net_wp', productLine: null },
      orderBy: { uwYear: 'desc' },
    });
    const nwpTarget = nwpTargetRecord ? Number(nwpTargetRecord.annualTarget) : null;

    const policyTargetRecord = await prisma.target.findFirst({
      where: { metricType: 'policy_count', productLine: null },
      orderBy: { uwYear: 'desc' },
    });
    const policyTarget = policyTargetRecord ? Number(policyTargetRecord.annualTarget) : null;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Get monthly NWP from premium records
    const monthlyNwpRaw = await prisma.$queryRaw<{ month: string; net_wp: string; period_date: Date }[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', period_date), 'YYYY-MM') AS month,
        SUM(net_wp)::text AS net_wp,
        DATE_TRUNC('month', period_date) AS period_date
      FROM premium_records
      GROUP BY DATE_TRUNC('month', period_date)
      ORDER BY DATE_TRUNC('month', period_date)
    `;

    const nwpByMonth = new Map(monthlyNwpRaw.map(r => [r.month, { actual: parseFloat(r.net_wp ?? '0'), date: r.period_date }]));

    // Compute run rate from last 3 months of actual data
    const sortedMonths = monthlyNwpRaw.slice(-3);
    const runRate = sortedMonths.length > 0
      ? sortedMonths.reduce((sum, r) => sum + parseFloat(r.net_wp ?? '0'), 0) / sortedMonths.length
      : 0;

    // Build 12-month forward-looking trajectory
    const nwpTrajectory = [];
    for (let i = -11; i <= 6; i++) {
      const d = new Date(currentYear, currentMonth + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const isPast = d <= now;
      const entry = nwpByMonth.get(key);
      if (isPast && entry) {
        nwpTrajectory.push({ month: key, actual: entry.actual, projected: null, isProjected: false });
      } else if (!isPast) {
        nwpTrajectory.push({ month: key, actual: null, projected: runRate, isProjected: true });
      }
    }

    // Projected YE NWP
    const { fyStart, currentMonthIndex } = getFyBoundaries(now);
    const ytdNwp = monthlyNwpRaw
      .filter(r => r.period_date >= fyStart)
      .reduce((sum, r) => sum + parseFloat(r.net_wp ?? '0'), 0);
    const monthsElapsed = currentMonthIndex + 1;
    const projectedYeNwp = monthsElapsed > 0 ? (ytdNwp / monthsElapsed) * 12 : null;

    // Policy trajectory from PolicyCount table
    const policyCounts = await prisma.policyCount.findMany({
      orderBy: { periodDate: 'asc' },
    });
    const policyByMonth = new Map(policyCounts.map(r => [r.month, r]));

    const policyTrajectory = [];
    for (let i = -11; i <= 6; i++) {
      const d = new Date(currentYear, currentMonth + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const isPast = d <= now;
      const entry = policyByMonth.get(key);
      if (isPast && entry) {
        policyTrajectory.push({
          month: key,
          actual: entry.inForce,
          projected: null,
          isProjected: false,
          isApproximate: entry.isApproximate,
        });
      } else {
        const lastActual = policyCounts[policyCounts.length - 1];
        policyTrajectory.push({
          month: key,
          actual: null,
          projected: lastActual?.inForce ?? null,
          isProjected: true,
          isApproximate: true,
        });
      }
    }

    // NB vs renewals
    const nbRenewalsRaw = await prisma.$queryRaw<{
      month: string;
      endorsement_type: string | null;
      net_wp: string;
    }[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', period_date), 'YYYY-MM') AS month,
        endorsement_type,
        SUM(net_wp)::text AS net_wp
      FROM premium_records
      GROUP BY DATE_TRUNC('month', period_date), endorsement_type
      ORDER BY DATE_TRUNC('month', period_date)
    `;

    const nbByMonth = new Map<string, { renewals: number; newBusiness: number; cancellations: number }>();
    for (const r of nbRenewalsRaw) {
      if (!nbByMonth.has(r.month)) {
        nbByMonth.set(r.month, { renewals: 0, newBusiness: 0, cancellations: 0 });
      }
      const entry = nbByMonth.get(r.month)!;
      const val = parseFloat(r.net_wp ?? '0');
      if (r.endorsement_type === 'Renewal') entry.renewals += val;
      else if (r.endorsement_type === 'New Business') entry.newBusiness += val;
      else if (r.endorsement_type === 'Cancellation') entry.cancellations += val;
    }

    const nbVsRenewals = Array.from(nbByMonth.entries()).map(([month, vals]) => ({
      month,
      renewals: vals.renewals,
      newBusiness: vals.newBusiness,
      cancellations: -Math.abs(vals.cancellations), // negative
    }));

    // Lapse rate
    const recentMonths = Array.from(nbByMonth.entries()).slice(-6);
    const last3 = recentMonths.slice(-3);
    const prior3 = recentMonths.slice(0, 3);

    function lapseRate(months: [string, { renewals: number; newBusiness: number; cancellations: number }][]): number {
      const totalCancellations = months.reduce((s, [, v]) => s + Math.abs(v.cancellations), 0);
      const totalActiveIn = months.reduce((s, [, v]) => s + v.renewals + v.newBusiness, 0);
      return totalActiveIn > 0 ? totalCancellations / totalActiveIn : 0;
    }

    const lapseRateLast3 = lapseRate(last3);
    const lapseRatePrior3 = lapseRate(prior3);
    let lapseRateTrend: 'rising' | 'flat' | 'falling' | null = null;
    if (last3.length > 0 && prior3.length > 0) {
      const diff = lapseRateLast3 - lapseRatePrior3;
      lapseRateTrend = diff > 0.005 ? 'rising' : diff < -0.005 ? 'falling' : 'flat';
    }

    // Overall NB rate
    const allNb = Array.from(nbByMonth.values()).reduce((s, v) => s + v.newBusiness, 0);
    const allTotal = Array.from(nbByMonth.values()).reduce((s, v) => s + v.renewals + v.newBusiness, 0);
    const newBusinessRate = allTotal > 0 ? allNb / allTotal : null;

    return NextResponse.json({
      hasRevenueData,
      nwpTrajectory,
      nwpTarget,
      policyTrajectory,
      policyTarget,
      nbVsRenewals,
      insights: {
        projectedYeNwp,
        nwpTarget,
        newBusinessRate,
        lapseRate: lapseRateLast3,
        lapseRateTrend,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
