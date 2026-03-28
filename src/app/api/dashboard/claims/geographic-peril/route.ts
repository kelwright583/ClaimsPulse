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
    return { gte: new Date(now.getFullYear(), now.getMonth() - 3, 1), lte: endOfMonth };
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
    const area = searchParams.get('area');
    const cause = searchParams.get('cause');
    const dateRange = searchParams.get('dateRange');
    const status = searchParams.get('status');

    // dateRange is accepted but spike detection uses fixed 30-day / 90-day windows
    void getDateRange(dateRange);

    const latestDate = await getLatestSnapshotDate();
    if (!latestDate) {
      return NextResponse.json({ byArea: [], heatmap: [], clusteringAlerts: [], claims: [] });
    }

    const snapshotDate = latestDate;
    const thirtyDaysAgo = new Date(snapshotDate);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const ninetyDaysAgo = new Date(snapshotDate);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Count by area for last 30 days (spike detection window)
    const areaCountsRaw = await prisma.$queryRaw<{ area: string | null; count: bigint }[]>`
      SELECT loss_area AS area, COUNT(*) AS count
      FROM claim_snapshots
      WHERE snapshot_date >= ${thirtyDaysAgo}
        AND snapshot_date <= ${snapshotDate}
        ${area ? Prisma.sql`AND loss_area ILIKE ${`%${area}%`}` : Prisma.empty}
        ${cause ? Prisma.sql`AND cause ILIKE ${`%${cause}%`}` : Prisma.empty}
        ${status ? Prisma.sql`AND claim_status = ${status}` : Prisma.empty}
        AND loss_area IS NOT NULL
      GROUP BY loss_area
      ORDER BY count DESC
    `;

    // Historical counts per area: days 31–90 (2 prior months), gives monthly avg
    const histRaw = await prisma.$queryRaw<{ area: string | null; count: bigint }[]>`
      SELECT loss_area AS area, COUNT(*) AS count
      FROM claim_snapshots
      WHERE snapshot_date >= ${ninetyDaysAgo}
        AND snapshot_date < ${thirtyDaysAgo}
        AND loss_area IS NOT NULL
        ${area ? Prisma.sql`AND loss_area ILIKE ${`%${area}%`}` : Prisma.empty}
        ${cause ? Prisma.sql`AND cause ILIKE ${`%${cause}%`}` : Prisma.empty}
        ${status ? Prisma.sql`AND claim_status = ${status}` : Prisma.empty}
      GROUP BY loss_area
    `;

    // Monthly average = count over 2 prior months / 2
    const histMap = new Map(histRaw.map(r => [r.area, Number(r.count)]));

    const byArea = areaCountsRaw.map(r => {
      const areaName = r.area ?? 'Unknown';
      const count = Number(r.count);
      const prevTotal = histMap.get(r.area) ?? 0;
      const historicalAvg = prevTotal > 0 ? prevTotal / 2 : null;
      const isSpike = historicalAvg !== null && historicalAvg > 0 && count > historicalAvg * 2;
      return { area: areaName, count, historicalAvg, isSpike };
    });

    // Heatmap: area × cause from latest snapshot
    const heatmapRaw = await prisma.$queryRaw<{ area: string | null; cause: string | null; count: bigint }[]>`
      SELECT loss_area AS area, cause, COUNT(*) AS count
      FROM claim_snapshots
      WHERE snapshot_date = ${snapshotDate}
        ${area ? Prisma.sql`AND loss_area ILIKE ${`%${area}%`}` : Prisma.empty}
        ${cause ? Prisma.sql`AND cause ILIKE ${`%${cause}%`}` : Prisma.empty}
        ${status ? Prisma.sql`AND claim_status = ${status}` : Prisma.empty}
        AND loss_area IS NOT NULL
        AND cause IS NOT NULL
      GROUP BY loss_area, cause
      ORDER BY count DESC
    `;

    const heatmap = heatmapRaw.map(r => ({
      area: r.area ?? 'Unknown',
      cause: r.cause ?? 'Unknown',
      count: Number(r.count),
    }));

    // Clustering alerts: areas where current 30-day count > 2× historical monthly avg
    const clusteringAlerts = byArea
      .filter(r => r.isSpike && r.historicalAvg !== null && r.historicalAvg > 0)
      .map(r => ({
        area: r.area,
        cause: cause ?? 'All',
        count: r.count,
        multiplier: r.historicalAvg
          ? Math.round((r.count / r.historicalAvg) * 10) / 10
          : 0,
        days: 30,
      }));

    // Claims list from latest snapshot
    const claimsRaw = await prisma.claimSnapshot.findMany({
      where: {
        snapshotDate,
        ...(area ? { lossArea: { contains: area, mode: 'insensitive' } } : {}),
        ...(cause ? { cause: { contains: cause, mode: 'insensitive' } } : {}),
        ...(status ? { claimStatus: status } : {}),
        lossArea: { not: null },
      },
      take: 100,
      orderBy: { totalIncurred: 'desc' },
      select: {
        claimId: true,
        lossArea: true,
        cause: true,
        handler: true,
        claimStatus: true,
        totalIncurred: true,
        daysInCurrentStatus: true,
      },
    });

    const claims = claimsRaw.map(r => ({
      claimId: r.claimId,
      area: r.lossArea,
      cause: r.cause,
      handler: r.handler,
      claimStatus: r.claimStatus,
      totalIncurred: r.totalIncurred ? Number(r.totalIncurred) : null,
      daysOpen: r.daysInCurrentStatus,
    }));

    return NextResponse.json({ byArea, heatmap, clusteringAlerts, claims });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
