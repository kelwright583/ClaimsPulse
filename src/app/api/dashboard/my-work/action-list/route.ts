import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { isFinalisedStatus, computeTatBreach } from '@/lib/reports/tat-helpers';

type Priority = 'critical' | 'urgent' | 'standard';

async function getLatestSnapshotDate(): Promise<Date | null> {
  const result = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  return result?.snapshotDate ?? null;
}

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    let handlerParam = searchParams.get('handler');
    const compareFrom = searchParams.get('compareFrom');
    const compareTo = searchParams.get('compareTo');

    // CLAIMS_TECHNICIAN: force to their own name
    if (ctx.role === 'CLAIMS_TECHNICIAN') {
      handlerParam = ctx.fullName ?? handlerParam;
    }

    const latestDate = await getLatestSnapshotDate();
    if (!latestDate) {
      return NextResponse.json({ handlerName: handlerParam ?? 'All', totalClaims: 0, items: [], handlers: [] });
    }

    const snapshotDate = latestDate;

    // All distinct handlers from latest snapshot for the dropdown
    const handlerRows = await prisma.claimSnapshot.findMany({
      where: { snapshotDate, handler: { not: null } },
      select: { handler: true },
      distinct: ['handler'],
      orderBy: { handler: 'asc' },
    });
    const handlers = handlerRows.map(r => r.handler!).filter(Boolean);

    // Fetch open claims for the handler
    const where: any = {
      snapshotDate,
      claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] },
    };
    if (handlerParam) where.handler = handlerParam;

    const snapshots = await prisma.claimSnapshot.findMany({
      where,
      select: {
        claimId: true,
        secondaryStatus: true,
        insured: true,
        cause: true,
        totalIncurred: true,
        daysInCurrentStatus: true,
        isTatBreach: true,
        handler: true,
      },
    });

    const claimIds = snapshots.map(s => s.claimId);

    // Previous snapshot date for status-change detection
    const prevDateRow = await prisma.claimSnapshot.findFirst({
      where: { snapshotDate: { lt: snapshotDate } },
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    });

    // Resolve comparison snapshot date
    let compareSnapshotDate: Date | null = null;
    if (compareFrom) {
      compareSnapshotDate = new Date(compareFrom);
    }

    const [tatConfigs, overdueDelays, prevSnaps, compareSnaps] = await Promise.all([
      prisma.tatConfig.findMany({ where: { isActive: true } }),
      claimIds.length > 0
        ? prisma.acknowledgedDelay.findMany({
            where: { claimId: { in: claimIds }, isActive: true },
            select: { claimId: true, isOverdue: true, expectedDate: true },
          })
        : Promise.resolve([]),
      prevDateRow && claimIds.length > 0
        ? prisma.claimSnapshot.findMany({
            where: { snapshotDate: prevDateRow.snapshotDate, claimId: { in: claimIds } },
            select: { claimId: true, secondaryStatus: true },
          })
        : Promise.resolve([]),
      compareSnapshotDate && claimIds.length > 0
        ? prisma.claimSnapshot.findMany({
            where: { snapshotDate: compareSnapshotDate, claimId: { in: claimIds } },
            select: { claimId: true, secondaryStatus: true },
          })
        : Promise.resolve([]),
    ]);

    const slaMap = new Map(tatConfigs.map(c => [c.secondaryStatus, c]));
    const delayMap = new Map(overdueDelays.map(d => [d.claimId, d]));
    const prevStatusMap = new Map(prevSnaps.map(p => [p.claimId, p.secondaryStatus]));
    const compareStatusMap = new Map(compareSnaps.map(p => [p.claimId, p.secondaryStatus]));

    // Exclude pending-closure claims from the action list — they don't need daily attention
    const activeSnapshots = snapshots.filter(s => !isFinalisedStatus(s.secondaryStatus, slaMap));

    const items = activeSnapshots.map(s => {
      const tatConfig = s.secondaryStatus ? slaMap.get(s.secondaryStatus) : null;
      const delay = delayMap.get(s.claimId);

      // Compute TAT breach live from tatMap so TAT matrix changes take effect immediately
      const computedTatBreach = computeTatBreach(s.secondaryStatus, s.daysInCurrentStatus, slaMap);

      let priority: Priority = 'standard';
      if (computedTatBreach && tatConfig?.priority === 'critical') {
        priority = 'critical';
      } else if (computedTatBreach || delay?.isOverdue) {
        priority = 'urgent';
      }

      let tatPosition: 'on-track' | 'at-risk' | 'breach' = 'on-track';
      if (computedTatBreach) {
        tatPosition = 'breach';
      } else if (tatConfig && s.daysInCurrentStatus && s.daysInCurrentStatus > tatConfig.maxDays * 0.8) {
        tatPosition = 'at-risk';
      }

      const lastActionedDate = s.daysInCurrentStatus !== null && s.daysInCurrentStatus !== undefined
        ? new Date(snapshotDate.getTime() - s.daysInCurrentStatus * 86400000).toISOString().split('T')[0]
        : null;
      const prevSecondaryStatus = prevStatusMap.has(s.claimId) ? (prevStatusMap.get(s.claimId) ?? null) : null;
      const statusChanged = prevStatusMap.has(s.claimId) && prevSecondaryStatus !== s.secondaryStatus;

      // isStuck: claim existed in compare snapshot with same secondaryStatus, still critical/urgent
      const compareSecondaryStatus = compareStatusMap.get(s.claimId);
      const isStuck = compareSnapshotDate !== null
        && compareSecondaryStatus !== undefined
        && compareSecondaryStatus === s.secondaryStatus
        && (priority === 'critical' || priority === 'urgent');

      return {
        claimId: s.claimId,
        secondaryStatus: s.secondaryStatus,
        insured: s.insured,
        cause: s.cause,
        totalIncurred: s.totalIncurred ? Number(s.totalIncurred) : null,
        daysInStatus: s.daysInCurrentStatus,
        priority,
        tatPosition,
        hasOverdueDelay: delay?.isOverdue ?? false,
        expectedDate: delay?.expectedDate ? delay.expectedDate.toISOString().split('T')[0] : null,
        lastActionedDate,
        statusChanged,
        previousSecondaryStatus: statusChanged ? prevSecondaryStatus : null,
        isStuck,
      };
    });

    // Sort: critical → urgent → standard; within each group sort by daysInStatus desc
    const priorityOrder: Record<Priority, number> = { critical: 0, urgent: 1, standard: 2 };
    items.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return (b.daysInStatus ?? 0) - (a.daysInStatus ?? 0);
    });

    return NextResponse.json({
      handlerName: handlerParam ?? 'All',
      totalClaims: items.length,
      items,
      handlers,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
