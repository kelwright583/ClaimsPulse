import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { Prisma } from '@prisma/client';
import { getFyBoundaries } from '@/lib/fiscal';

const ALLOWED_ROLES = ['HEAD_OF_CLAIMS', 'TEAM_LEADER'] as const;

async function getLatestSnapshotDate(): Promise<Date | null> {
  const result = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  return result?.snapshotDate ?? null;
}

function getDateRange(dateRange: string | null): { gte: Date; lte: Date } {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  if (dateRange === 'last-month') {
    return {
      gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      lte: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
    };
  }
  if (dateRange === 'last-3-months') {
    return {
      gte: new Date(now.getFullYear(), now.getMonth() - 3, 1),
      lte: endOfMonth,
    };
  }
  if (dateRange === 'ytd') {
    const { fyStart } = getFyBoundaries(now);
    return { gte: fyStart, lte: endOfMonth };
  }
  return { gte: startOfMonth, lte: endOfMonth };
}

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const dateRange = searchParams.get('dateRange');
    const productLine = searchParams.get('productLine') || null;
    const cause = searchParams.get('cause') || null;
    const status = searchParams.get('status') || null;

    const latestDate = await getLatestSnapshotDate();
    if (!latestDate) {
      return NextResponse.json({
        stats: { totalOpen: 0, totalOutstanding: 0, totalIncurredMtd: 0, avgDaysOpen: 0 },
        byStatus: [],
        byCause: [],
        outstandingTrend: [],
        reserveSummary: { totalClaims: 0, avgReserve: 0, avgCost: 0, gap: 0, totalOutstanding: 0 },
        reserveByCause: [],
        claims: [],
      });
    }

    const where: any = { snapshotDate: latestDate };
    if (productLine) where.productLine = { contains: productLine, mode: 'insensitive' };
    if (cause) where.cause = { contains: cause, mode: 'insensitive' };
    if (status) where.claimStatus = { contains: status, mode: 'insensitive' };

    const openWhere: any = {
      ...where,
      claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] },
    };

    const [totalOpenCount, aggregateResult, avgDaysResult] = await Promise.all([
      prisma.claimSnapshot.count({ where: openWhere }),
      prisma.claimSnapshot.aggregate({ where: openWhere, _sum: { totalOs: true } }),
      prisma.claimSnapshot.aggregate({ where: openWhere, _avg: { daysInCurrentStatus: true } }),
    ]);

    // MTD incurred
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const mtdResult = await prisma.claimSnapshot.aggregate({
      where: { ...where, snapshotDate: { gte: monthStart } },
      _sum: { totalIncurred: true },
    });

    const [byStatusRaw, byCauseRaw] = await Promise.all([
      prisma.claimSnapshot.groupBy({
        by: ['claimStatus'],
        where,
        _count: { claimId: true },
        orderBy: { _count: { claimId: 'desc' } },
      }),
      prisma.claimSnapshot.groupBy({
        by: ['cause'],
        where: { ...where, cause: { not: null } },
        _count: { claimId: true },
        orderBy: { _count: { claimId: 'desc' } },
        take: 8,
      }),
    ]);

    // Outstanding trend — last 8 weeks using raw SQL for weekly bucketing
    const eightWeeksAgo = new Date(latestDate);
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    const trendRaw = await prisma.$queryRaw<{ week: string; total_os: string }[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('week', snapshot_date), 'YYYY-WW') AS week,
        SUM(total_os)::text AS total_os
      FROM claim_snapshots
      WHERE snapshot_date >= ${eightWeeksAgo}
        AND snapshot_date <= ${latestDate}
        ${productLine ? Prisma.sql`AND product_line ILIKE ${`%${productLine}%`}` : Prisma.empty}
        ${cause ? Prisma.sql`AND cause ILIKE ${`%${cause}%`}` : Prisma.empty}
        ${status ? Prisma.sql`AND claim_status ILIKE ${`%${status}%`}` : Prisma.empty}
      GROUP BY DATE_TRUNC('week', snapshot_date)
      ORDER BY DATE_TRUNC('week', snapshot_date)
    `;

    const outstandingTrend = trendRaw.map(r => ({
      week: r.week,
      totalOs: parseFloat(r.total_os ?? '0'),
    }));

    // Reserve adequacy by cause
    const reserveByCauseRaw = await prisma.$queryRaw<{
      cause: string | null;
      claim_count: bigint;
      avg_reserve: string;
      avg_incurred: string;
      avg_paid: string;
      total_os: string;
      total_incurred: string;
      total_intimated: string;
    }[]>`
      SELECT
        cause,
        COUNT(*) AS claim_count,
        AVG(intimated_amount)::text AS avg_reserve,
        AVG(total_incurred)::text AS avg_incurred,
        AVG(total_paid)::text AS avg_paid,
        SUM(total_os)::text AS total_os,
        SUM(total_incurred)::text AS total_incurred,
        SUM(intimated_amount)::text AS total_intimated
      FROM claim_snapshots
      WHERE snapshot_date = ${latestDate}
        AND claim_status NOT IN ('Finalised', 'Cancelled', 'Repudiated')
        AND intimated_amount > 0
      GROUP BY cause
      ORDER BY COUNT(*) DESC
    `;

    const reserveByCause = reserveByCauseRaw.map(r => {
      const avgReserve = parseFloat(r.avg_reserve ?? '0');
      const avgCost = parseFloat(r.avg_paid ?? '0');
      const totalIncurred = parseFloat(r.total_incurred ?? '0');
      const totalIntimated = parseFloat(r.total_intimated ?? '0');
      const gapPct = avgReserve > 0
        ? Math.round(((avgCost - avgReserve) / avgReserve) * 100)
        : 0;
      return {
        cause: r.cause ?? 'Unknown',
        claimCount: Number(r.claim_count),
        avgReserve: Math.round(avgReserve),
        avgCost: Math.round(avgCost),
        gapPct,
        totalOutstanding: Math.round(parseFloat(r.total_os ?? '0')),
        utilisationPct: totalIntimated > 0
          ? Math.round((totalIncurred / totalIntimated) * 100)
          : 0,
      };
    });

    const overallRaw = await prisma.$queryRaw<{
      total_claims: bigint;
      avg_reserve: string;
      avg_cost: string;
      total_os: string;
    }[]>`
      SELECT
        COUNT(*) AS total_claims,
        AVG(intimated_amount)::text AS avg_reserve,
        AVG(total_paid)::text AS avg_cost,
        SUM(total_os)::text AS total_os
      FROM claim_snapshots
      WHERE snapshot_date = ${latestDate}
        AND claim_status NOT IN ('Finalised', 'Cancelled', 'Repudiated')
        AND intimated_amount > 0
    `;

    const overall = overallRaw[0];
    const overallAvgReserve = Math.round(parseFloat(overall?.avg_reserve ?? '0'));
    const overallAvgCost = Math.round(parseFloat(overall?.avg_cost ?? '0'));
    const reserveSummary = {
      totalClaims: Number(overall?.total_claims ?? 0),
      avgReserve: overallAvgReserve,
      avgCost: overallAvgCost,
      gap: overallAvgCost - overallAvgReserve,
      totalOutstanding: Math.round(parseFloat(overall?.total_os ?? '0')),
    };

    // Claims list
    const claimsRaw = await prisma.claimSnapshot.findMany({
      where,
      take: 100,
      orderBy: { totalOs: 'desc' },
      select: {
        claimId: true,
        handler: true,
        claimStatus: true,
        secondaryStatus: true,
        cause: true,
        daysInCurrentStatus: true,
        totalIncurred: true,
        totalOs: true,
        isTatBreach: true,
      },
    });

    const tatConfigs = await prisma.tatConfig.findMany({ where: { isActive: true } });
    const slaMap = new Map(tatConfigs.map(c => [c.secondaryStatus, c]));

    const claims = claimsRaw.map(r => {
      const tatConfig = r.secondaryStatus ? slaMap.get(r.secondaryStatus) : null;
      let tatPosition: 'on-track' | 'at-risk' | 'breach' = 'on-track';
      if (r.isTatBreach) {
        tatPosition = 'breach';
      } else if (tatConfig && r.daysInCurrentStatus && r.daysInCurrentStatus > tatConfig.maxDays * 0.8) {
        tatPosition = 'at-risk';
      }
      return {
        claimId: r.claimId,
        handler: r.handler,
        claimStatus: r.claimStatus,
        secondaryStatus: r.secondaryStatus,
        cause: r.cause,
        daysOpen: r.daysInCurrentStatus,
        totalIncurred: r.totalIncurred ? Number(r.totalIncurred) : null,
        totalOs: r.totalOs ? Number(r.totalOs) : null,
        tatPosition,
      };
    });

    // dateRange param reference (used in determining context, not filtering snapshot date here)
    void getDateRange(dateRange);

    return NextResponse.json({
      stats: {
        totalOpen: totalOpenCount,
        totalOutstanding: aggregateResult._sum.totalOs ? Number(aggregateResult._sum.totalOs) : 0,
        totalIncurredMtd: mtdResult._sum.totalIncurred ? Number(mtdResult._sum.totalIncurred) : 0,
        avgDaysOpen: avgDaysResult._avg.daysInCurrentStatus
          ? Math.round(Number(avgDaysResult._avg.daysInCurrentStatus))
          : 0,
      },
      byStatus: byStatusRaw.map(s => ({ status: s.claimStatus ?? 'Unknown', count: s._count.claimId })),
      byCause: byCauseRaw.map(s => ({ cause: s.cause ?? 'Unknown', count: s._count.claimId })),
      outstandingTrend,
      reserveSummary,
      reserveByCause,
      claims,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
