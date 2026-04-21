import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
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
    return { gte: new Date(now.getFullYear(), now.getMonth() - 3, 1), lte: endOfMonth };
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
    const brokerFilter = searchParams.get('broker');
    const productLine = searchParams.get('productLine');
    const dateRange = searchParams.get('dateRange');

    const latestDate = await getLatestSnapshotDate();
    if (!latestDate) return NextResponse.json({ brokers: [], claims: [], hasRevenueData: false });

    // dateRange is accepted for context but snapshot filtering uses latestDate
    void getDateRange(dateRange);

    const where: any = { snapshotDate: latestDate, broker: { not: null } };
    if (brokerFilter) where.broker = { contains: brokerFilter, mode: 'insensitive' };
    if (productLine) where.productLine = { contains: productLine, mode: 'insensitive' };

    const [brokerGroups, premiumCount] = await Promise.all([
      prisma.claimSnapshot.groupBy({
        by: ['broker'],
        where,
        _count: { claimId: true },
        _avg: { notificationGapDays: true, totalIncurred: true },
        orderBy: { _count: { claimId: 'desc' } },
      }),
      prisma.premiumRecord.count(),
    ]);

    const hasRevenueData = premiumCount > 0;

    // Repudiation rates
    const repudiatedGroups = await prisma.claimSnapshot.groupBy({
      by: ['broker'],
      where: { ...where, claimStatus: 'Repudiated' },
      _count: { claimId: true },
    });
    const repMap = new Map(repudiatedGroups.map(r => [r.broker, r._count.claimId]));

    // Open counts
    const openGroups = await prisma.claimSnapshot.groupBy({
      by: ['broker'],
      where: { ...where, claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] } },
      _count: { claimId: true },
    });
    const openMap = new Map(openGroups.map(r => [r.broker, r._count.claimId]));

    // Premium by broker for loss ratio
    let premiumByBroker = new Map<string, number>();
    if (hasRevenueData) {
      const premGroups = await prisma.premiumRecord.groupBy({
        by: ['broker'],
        where: { broker: { not: null } },
        _sum: { netWp: true },
      });
      premiumByBroker = new Map(
        premGroups.map(p => [p.broker ?? '', p._sum.netWp ? Number(p._sum.netWp) : 0])
      );
    }

    // Incurred totals per broker for loss ratio
    const incurredGroups = await prisma.claimSnapshot.groupBy({
      by: ['broker'],
      where,
      _sum: { totalIncurred: true },
    });
    const incurredMap = new Map(
      incurredGroups.map(r => [r.broker, r._sum.totalIncurred ? Number(r._sum.totalIncurred) : 0])
    );

    const brokers = brokerGroups
      .filter(g => g.broker)
      .map(g => {
        const broker = g.broker!;
        const totalIncurred = incurredMap.get(broker) ?? 0;
        const nwp = premiumByBroker.get(broker) ?? 0;
        const claimCount = g._count.claimId;
        return {
          broker,
          claimCount,
          lossRatio: hasRevenueData && nwp > 0
            ? Math.round((totalIncurred / nwp) * 100 * 10) / 10
            : null,
          avgNotificationGap: g._avg.notificationGapDays
            ? Math.round(Number(g._avg.notificationGapDays) * 10) / 10
            : null,
          repudiationRate: claimCount > 0
            ? Math.round(((repMap.get(broker) ?? 0) / claimCount) * 100 * 10) / 10
            : null,
          avgClaimValue: g._avg.totalIncurred ? Number(g._avg.totalIncurred) : null,
          openClaims: openMap.get(broker) ?? 0,
        };
      });

    const claimsRaw = await prisma.claimSnapshot.findMany({
      where,
      select: {
        claimId: true,
        broker: true,
        handler: true,
        claimStatus: true,
        cause: true,
        totalIncurred: true,
        daysInCurrentStatus: true,
      },
      take: 100,
      orderBy: { totalIncurred: 'desc' },
    });

    const claims = claimsRaw.map(c => ({
      claimId: c.claimId,
      broker: c.broker,
      handler: c.handler,
      claimStatus: c.claimStatus,
      cause: c.cause,
      totalIncurred: c.totalIncurred ? Number(c.totalIncurred) : null,
      daysOpen: c.daysInCurrentStatus,
    }));

    return NextResponse.json({ brokers, claims, hasRevenueData });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
