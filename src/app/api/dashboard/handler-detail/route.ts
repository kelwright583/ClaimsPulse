import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { computeTatBreach, priorityFromTat, isFinalisedStatus } from '@/lib/reports/tat-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const handler = searchParams.get('handler');
  const toDateStr = searchParams.get('toDate');
  const fromDateStr = searchParams.get('fromDate');

  if (!handler) return NextResponse.json({ error: 'handler required' }, { status: 400 });

  try {
    const tatConfigs = await prisma.tatConfig.findMany({ where: { isActive: true } });
    const tatMap = new Map(tatConfigs.map(c => [c.secondaryStatus, c]));

    // Resolve toDate
    let toDate: Date;
    if (toDateStr) {
      toDate = new Date(toDateStr);
    } else {
      const latest = await prisma.claimSnapshot.findFirst({ orderBy: { snapshotDate: 'desc' }, select: { snapshotDate: true } });
      if (!latest) return NextResponse.json({ error: 'No snapshot data' }, { status: 404 });
      toDate = latest.snapshotDate;
    }

    const toSnaps = await prisma.claimSnapshot.findMany({
      where: {
        handler,
        snapshotDate: toDate,
        claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] },
      },
      select: { claimId: true, secondaryStatus: true, daysInCurrentStatus: true, totalOs: true, totalIncurred: true, claimStatus: true },
    });

    // Exclude pending-closure claims (isFinalised secondary status) from active workload
    const activeSnaps = toSnaps.filter(s => !isFinalisedStatus(s.secondaryStatus, tatMap));

    // Classify items
    const classifyItems = (snaps: typeof toSnaps) => snaps.map(s => {
      const tatBreach = computeTatBreach(s.secondaryStatus, s.daysInCurrentStatus, tatMap);
      const priority = priorityFromTat(s.secondaryStatus, s.daysInCurrentStatus, false, tatMap);
      const tatCfg = s.secondaryStatus ? tatMap.get(s.secondaryStatus) : undefined;
      let tatStatus: 'BREACH' | 'AT RISK' | 'ON TRACK' = 'ON TRACK';
      if (tatBreach) tatStatus = 'BREACH';
      else if (tatCfg && (s.daysInCurrentStatus ?? 0) > tatCfg.maxDays * 0.8) tatStatus = 'AT RISK';
      return {
        claimId: s.claimId,
        secondaryStatus: s.secondaryStatus,
        daysInStatus: s.daysInCurrentStatus,
        outstanding: Number(s.totalOs ?? 0),
        totalIncurred: Number(s.totalIncurred ?? 0),
        priority,
        tatStatus,
      };
    });

    const currentItems = classifyItems(activeSnaps);
    const criticalItems = currentItems.filter(i => i.priority === 'critical');
    const urgentItems = currentItems.filter(i => i.priority === 'urgent');
    const standardItems = currentItems.filter(i => i.priority === 'standard');
    const tatBreachesCurrent = currentItems.filter(i => i.tatStatus === 'BREACH').length;
    const totalOsCurrent = activeSnaps.reduce((sum, s) => sum + Number(s.totalOs ?? 0), 0);

    // Finalised count (for period)
    const finalisedCurrent = await prisma.claimSnapshot.count({
      where: { handler, snapshotDate: toDate, deltaFlags: { path: ['finalised'], equals: true } },
    });

    // Portfolio composition
    const portfolio = {
      critical: criticalItems.length,
      urgent: urgentItems.length,
      standard: standardItems.length,
      finalised: finalisedCurrent,
      totalOpen: activeSnaps.length,
    };

    // Comparison data (if fromDate provided)
    let comparison: {
      criticalPrevious: number;
      urgentPrevious: number;
      standardPrevious: number;
      tatBreachesPrevious: number;
      totalOsPrevious: number;
      finalisedPrevious: number;
      stuckClaims: Array<{ claimId: string; secondaryStatus: string | null; daysInStatus: number | null; outstanding: number }>;
      improvedClaims: Array<{ claimId: string; previousStatus: string | null; currentStatus: string | null; outstanding: number }>;
      worsenedClaims: Array<{ claimId: string; previousStatus: string | null; currentStatus: string | null; outstanding: number }>;
    } | null = null;

    if (fromDateStr) {
      const fromDate = new Date(fromDateStr);
      const fromSnaps = await prisma.claimSnapshot.findMany({
        where: { handler, snapshotDate: fromDate },
        select: { claimId: true, secondaryStatus: true, daysInCurrentStatus: true, totalOs: true, claimStatus: true },
      });

      const fromItems = fromSnaps.map(s => {
        const priority = priorityFromTat(s.secondaryStatus, s.daysInCurrentStatus, false, tatMap);
        return { claimId: s.claimId, secondaryStatus: s.secondaryStatus, priority, totalOs: Number(s.totalOs ?? 0) };
      });

      const fromMap = new Map(fromItems.map(i => [i.claimId, i]));
      const toMap = new Map(currentItems.map(i => [i.claimId, i]));

      const stuckClaims = currentItems.filter(curr => {
        const prev = fromMap.get(curr.claimId);
        return prev && prev.secondaryStatus === curr.secondaryStatus
          && (curr.priority === 'critical' || curr.priority === 'urgent');
      }).map(i => ({ claimId: i.claimId, secondaryStatus: i.secondaryStatus, daysInStatus: i.daysInStatus, outstanding: i.outstanding }));

      const priorityRank = { critical: 2, urgent: 1, standard: 0 };
      const improvedClaims: Array<{ claimId: string; previousStatus: string | null; currentStatus: string | null; outstanding: number }> = [];
      const worsenedClaims: Array<{ claimId: string; previousStatus: string | null; currentStatus: string | null; outstanding: number }> = [];

      for (const [claimId, prev] of fromMap) {
        const curr = toMap.get(claimId);
        if (!curr) {
          // In from but not in current → finalised/resolved
          improvedClaims.push({ claimId, previousStatus: prev.secondaryStatus, currentStatus: null, outstanding: prev.totalOs });
          continue;
        }
        const prevRank = priorityRank[prev.priority];
        const currRank = priorityRank[curr.priority];
        if (currRank < prevRank) improvedClaims.push({ claimId, previousStatus: prev.secondaryStatus, currentStatus: curr.secondaryStatus, outstanding: curr.outstanding });
        else if (currRank > prevRank) worsenedClaims.push({ claimId, previousStatus: prev.secondaryStatus, currentStatus: curr.secondaryStatus, outstanding: curr.outstanding });
      }

      const fromClassified = fromItems;
      const tatBreachesPrevious = fromSnaps.filter(s => computeTatBreach(s.secondaryStatus, s.daysInCurrentStatus, tatMap)).length;
      const finalisedPrevious = await prisma.claimSnapshot.count({
        where: { handler, snapshotDate: fromDate, deltaFlags: { path: ['finalised'], equals: true } },
      });

      comparison = {
        criticalPrevious: fromClassified.filter(i => i.priority === 'critical').length,
        urgentPrevious: fromClassified.filter(i => i.priority === 'urgent').length,
        standardPrevious: fromClassified.filter(i => i.priority === 'standard').length,
        tatBreachesPrevious,
        totalOsPrevious: fromSnaps.reduce((sum, s) => sum + Number(s.totalOs ?? 0), 0),
        finalisedPrevious,
        stuckClaims,
        improvedClaims: improvedClaims.slice(0, 50),
        worsenedClaims: worsenedClaims.slice(0, 50),
      };
    }

    return NextResponse.json({
      handler,
      toDate: toDate.toISOString().split('T')[0],
      fromDate: fromDateStr ?? null,
      metrics: {
        criticalCurrent: criticalItems.length,
        urgentCurrent: urgentItems.length,
        standardCurrent: standardItems.length,
        tatBreachesCurrent,
        totalOsCurrent,
        finalisedCurrent,
      },
      portfolio,
      criticalItems: criticalItems.slice(0, 100),
      urgentItems: urgentItems.slice(0, 100),
      standardItems: standardItems.slice(0, 200),
      comparison,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
