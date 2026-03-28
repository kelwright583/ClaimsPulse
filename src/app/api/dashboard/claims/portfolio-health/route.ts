import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { Prisma } from '@prisma/client';

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
    const oct = now.getMonth() >= 9
      ? new Date(now.getFullYear(), 9, 1)
      : new Date(now.getFullYear() - 1, 9, 1);
    return { gte: oct, lte: endOfMonth };
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
        reserveHeatmap: [],
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

    // Reserve heatmap
    const heatmapRaw = await prisma.$queryRaw<{
      handler: string | null;
      product_line: string | null;
      count: bigint;
      avg_utilisation: string;
    }[]>`
      SELECT
        handler,
        product_line,
        COUNT(*) AS count,
        AVG(reserve_utilisation_pct)::text AS avg_utilisation
      FROM claim_snapshots
      WHERE snapshot_date = ${latestDate}
        AND reserve_utilisation_pct > 80
        ${productLine ? Prisma.sql`AND product_line ILIKE ${`%${productLine}%`}` : Prisma.empty}
      GROUP BY handler, product_line
    `;

    const reserveHeatmap = heatmapRaw.map(r => {
      const util = parseFloat(r.avg_utilisation ?? '0');
      return {
        handler: r.handler ?? 'Unassigned',
        claimType: r.product_line ?? 'Unknown',
        count: Number(r.count),
        severity: (util >= 100 ? 'red' : 'amber') as 'ok' | 'amber' | 'red',
      };
    });

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
        isSlaBreach: true,
      },
    });

    const slaConfigs = await prisma.slaConfig.findMany({ where: { isActive: true } });
    const slaMap = new Map(slaConfigs.map(c => [c.secondaryStatus, c]));

    const claims = claimsRaw.map(r => {
      const slaConfig = r.secondaryStatus ? slaMap.get(r.secondaryStatus) : null;
      let slaPosition: 'on-track' | 'at-risk' | 'breach' = 'on-track';
      if (r.isSlaBreach) {
        slaPosition = 'breach';
      } else if (slaConfig && r.daysInCurrentStatus && r.daysInCurrentStatus > slaConfig.maxDays * 0.8) {
        slaPosition = 'at-risk';
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
        slaPosition,
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
      reserveHeatmap,
      claims,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
