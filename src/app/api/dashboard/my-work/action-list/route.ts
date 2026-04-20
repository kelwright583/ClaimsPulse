import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

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

    // SLA configs
    const tatConfigs = await prisma.tatConfig.findMany({ where: { isActive: true } });
    const slaMap = new Map(tatConfigs.map(c => [c.secondaryStatus, c]));

    // Acknowledged delays (active)
    const overdueDelays = claimIds.length > 0
      ? await prisma.acknowledgedDelay.findMany({
          where: { claimId: { in: claimIds }, isActive: true },
          select: { claimId: true, isOverdue: true, expectedDate: true },
        })
      : [];
    const delayMap = new Map(overdueDelays.map(d => [d.claimId, d]));

    const items = snapshots.map(s => {
      const tatConfig = s.secondaryStatus ? slaMap.get(s.secondaryStatus) : null;
      const delay = delayMap.get(s.claimId);

      let priority: Priority = 'standard';
      if (s.isTatBreach && tatConfig?.priority === 'critical') {
        priority = 'critical';
      } else if (s.isTatBreach || delay?.isOverdue) {
        priority = 'urgent';
      }

      let tatPosition: 'on-track' | 'at-risk' | 'breach' = 'on-track';
      if (s.isTatBreach) {
        tatPosition = 'breach';
      } else if (tatConfig && s.daysInCurrentStatus && s.daysInCurrentStatus > tatConfig.maxDays * 0.8) {
        tatPosition = 'at-risk';
      }

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
