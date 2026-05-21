import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { computeTatBreach, isFinalisedStatus } from '@/lib/reports/tat-helpers';

const ALLOWED_ROLES = ['HEAD_OF_CLAIMS', 'TEAM_LEADER'] as const;

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
  if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const compareFrom = searchParams.get('compareFrom');
  const compareTo = searchParams.get('compareTo');

  try {
    const latestDate = await getLatestSnapshotDate();
    if (!latestDate) {
      return NextResponse.json({
        alertCards: { tatBreaches: 0, redFlags: 0, bigClaimsOpen: 0, unassignedWithPayment: 0 },
        attention: { uploadDate: null, readyToClose: 0, newlyBreached: 0, valueJumps: 0, stagnant: 0 },
        handlerHealth: [],
      });
    }

    const snapshotDate = latestDate;

    // Load TAT config once — used for live breach computation everywhere below
    const tatConfigs = await prisma.tatConfig.findMany({ where: { isActive: true } });
    const tatMap = new Map(tatConfigs.map(c => [c.secondaryStatus, c]));

    // Previous snapshot date
    const prevSnap = await prisma.claimSnapshot.findFirst({
      where: { snapshotDate: { lt: snapshotDate } },
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    });
    const prevDate = prevSnap?.snapshotDate ?? null;

    // Load all open snapshots for today — single fetch, compute everything from it
    // This ensures TAT matrix edits (maxDays/priority) take effect immediately
    const [allOpenSnaps, redFlags, unassignedWithPayment, latestRun] = await Promise.all([
      prisma.claimSnapshot.findMany({
        where: { snapshotDate, claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] } },
        select: {
          claimId: true,
          secondaryStatus: true,
          daysInCurrentStatus: true,
          totalOs: true,
          totalIncurred: true,
          handler: true,
          deltaFlags: true,
        },
      }),
      prisma.claimFlag.count({ where: { detail: { path: ['actioned'], equals: false } } }),
      prisma.claimSnapshot.count({ where: { snapshotDate, handler: null, totalPaid: { gt: 0 } } }),
      prisma.importRun.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);

    // Split: active claims vs pending-closure claims (isFinalised secondary status)
    const pendingClosureSnaps = allOpenSnaps.filter(s => isFinalisedStatus(s.secondaryStatus, tatMap));
    const activeSnaps = allOpenSnaps.filter(s => !isFinalisedStatus(s.secondaryStatus, tatMap));

    // Alert card counts — live breach computation (respects current TAT matrix values)
    const tatBreaches = activeSnaps.filter(s => computeTatBreach(s.secondaryStatus, s.daysInCurrentStatus, tatMap)).length;
    const bigClaimsOpen = activeSnaps.filter(s => Number(s.totalIncurred ?? 0) > 250000).length;

    // Attention items
    const readyToClose = activeSnaps.filter(s => !s.totalOs || Number(s.totalOs) === 0).length;
    const pendingClosure = pendingClosureSnaps.length;

    let valueJumps = 0, stagnant = 0;
    for (const s of activeSnaps) {
      const flags = s.deltaFlags as Record<string, unknown> | null;
      if (!flags) continue;
      if (flags['value_jump_20pct']) valueJumps++;
      const isBreach = computeTatBreach(s.secondaryStatus, s.daysInCurrentStatus, tatMap);
      if (isBreach && !flags['secondary_status_change']) stagnant++;
    }

    // Newly breached: in breach today but not yesterday (live computation on both dates)
    let newlyBreached = 0;
    if (prevDate) {
      const prevOpenSnaps = await prisma.claimSnapshot.findMany({
        where: { snapshotDate: prevDate, claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] } },
        select: { claimId: true, secondaryStatus: true, daysInCurrentStatus: true },
      });
      const prevBreachedSet = new Set(
        prevOpenSnaps
          .filter(s => !isFinalisedStatus(s.secondaryStatus, tatMap) && computeTatBreach(s.secondaryStatus, s.daysInCurrentStatus, tatMap))
          .map(s => s.claimId),
      );
      newlyBreached = activeSnaps
        .filter(s => computeTatBreach(s.secondaryStatus, s.daysInCurrentStatus, tatMap) && !prevBreachedSet.has(s.claimId))
        .length;
    }

    // Handler health — live breach from tatMap (not stored field)
    const handlerMap = new Map<string, { openCount: number; breachCount: number }>();
    for (const s of activeSnaps) {
      if (!s.handler) continue;
      const h = handlerMap.get(s.handler) ?? { openCount: 0, breachCount: 0 };
      h.openCount++;
      if (computeTatBreach(s.secondaryStatus, s.daysInCurrentStatus, tatMap)) h.breachCount++;
      handlerMap.set(s.handler, h);
    }
    const handlerHealth = [...handlerMap.entries()]
      .map(([handler, h]) => ({ handler, openCount: h.openCount, breachCount: h.breachCount, lastActivity: null }))
      .sort((a, b) => b.openCount - a.openCount);

    // Comparison data
    let comparison: {
      alertCards: { tatBreaches: number; redFlags: number; bigClaimsOpen: number; unassignedWithPayment: number };
      attention: { readyToClose: number; newlyBreached: number; valueJumps: number; stagnant: number; pendingClosure: number };
    } | null = null;

    if (compareFrom) {
      const fromDate = new Date(compareFrom);
      const [cOpenSnaps, cRedFlags, cUnassigned] = await Promise.all([
        prisma.claimSnapshot.findMany({
          where: { snapshotDate: fromDate, claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] } },
          select: { claimId: true, secondaryStatus: true, daysInCurrentStatus: true, totalOs: true, totalIncurred: true, deltaFlags: true, handler: true },
        }),
        prisma.claimFlag.count({ where: { detail: { path: ['actioned'], equals: false } } }),
        prisma.claimSnapshot.count({ where: { snapshotDate: fromDate, handler: null, totalPaid: { gt: 0 } } }),
      ]);

      const cActive = cOpenSnaps.filter(s => !isFinalisedStatus(s.secondaryStatus, tatMap));
      const cTatBreaches = cActive.filter(s => computeTatBreach(s.secondaryStatus, s.daysInCurrentStatus, tatMap)).length;
      const cBigClaims = cActive.filter(s => Number(s.totalIncurred ?? 0) > 250000).length;
      const cReadyToClose = cActive.filter(s => !s.totalOs || Number(s.totalOs) === 0).length;
      const cPendingClosure = cOpenSnaps.filter(s => isFinalisedStatus(s.secondaryStatus, tatMap)).length;

      let cValueJumps = 0, cStagnant = 0;
      for (const s of cActive) {
        const flags = s.deltaFlags as Record<string, unknown> | null;
        if (!flags) continue;
        if (flags['value_jump_20pct']) cValueJumps++;
        if (computeTatBreach(s.secondaryStatus, s.daysInCurrentStatus, tatMap) && !flags['secondary_status_change']) cStagnant++;
      }

      comparison = {
        alertCards: { tatBreaches: cTatBreaches, redFlags: cRedFlags, bigClaimsOpen: cBigClaims, unassignedWithPayment: cUnassigned },
        attention: { readyToClose: cReadyToClose, newlyBreached: 0, valueJumps: cValueJumps, stagnant: cStagnant, pendingClosure: cPendingClosure },
      };
    }

    return NextResponse.json({
      alertCards: { tatBreaches, redFlags, bigClaimsOpen, unassignedWithPayment },
      attention: {
        uploadDate: latestRun?.createdAt.toISOString() ?? null,
        readyToClose,
        newlyBreached,
        valueJumps,
        stagnant,
        pendingClosure,
      },
      handlerHealth,
      comparison,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
