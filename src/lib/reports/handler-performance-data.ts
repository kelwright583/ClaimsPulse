import { prisma } from '@/lib/prisma';
import { computeTatBreach, priorityFromTat, tatPositionToStatus, computeTatPosition } from './tat-helpers';
import type { HandlerPerformancePDFData } from './handler-performance-pdf';

export async function fetchHandlerPerformanceData(
  handler: string,
  toDateStr?: string,
  fromDateStr?: string,
): Promise<HandlerPerformancePDFData> {
  const tatConfigs = await prisma.tatConfig.findMany({ where: { isActive: true } });
  const tatMap = new Map(tatConfigs.map(c => [c.secondaryStatus, c]));

  // Resolve toDate
  let toDate: Date;
  if (toDateStr) {
    toDate = new Date(toDateStr);
  } else {
    const latest = await prisma.claimSnapshot.findFirst({ orderBy: { snapshotDate: 'desc' }, select: { snapshotDate: true } });
    toDate = latest?.snapshotDate ?? new Date();
  }

  const toSnaps = await prisma.claimSnapshot.findMany({
    where: { handler, snapshotDate: toDate },
    select: {
      claimId: true,
      secondaryStatus: true,
      daysInCurrentStatus: true,
      totalOs: true,
      totalIncurred: true,
      claimStatus: true,
    },
  });

  const openSnaps = toSnaps.filter(s => !['Finalised', 'Cancelled', 'Repudiated'].includes(s.claimStatus ?? ''));

  const classifySnap = (s: typeof openSnaps[0]) => {
    const tatBreach = computeTatBreach(s.secondaryStatus, s.daysInCurrentStatus, tatMap);
    const priority = priorityFromTat(s.secondaryStatus, s.daysInCurrentStatus, false, tatMap);
    const tatPos = computeTatPosition(s.secondaryStatus, s.daysInCurrentStatus, tatMap);
    return {
      claimId: s.claimId,
      secondaryStatus: s.secondaryStatus,
      daysInStatus: s.daysInCurrentStatus ?? 0,
      outstanding: Number(s.totalOs ?? 0),
      tatStatus: tatPositionToStatus(tatPos) as 'BREACH' | 'AT RISK' | 'ON TRACK',
      priority,
      tatBreach,
    };
  };

  const classified = openSnaps.map(classifySnap);
  const criticalItems = classified.filter(i => i.priority === 'critical');
  const urgentItems = classified.filter(i => i.priority === 'urgent');
  const standardItems = classified.filter(i => i.priority === 'standard');
  const finalisedSnaps = toSnaps.filter(s => s.claimStatus?.toLowerCase().includes('finalised'));

  const portfolio = {
    critical: criticalItems.length,
    urgent: urgentItems.length,
    standard: standardItems.length,
    finalised: finalisedSnaps.length,
    totalOpen: openSnaps.length,
  };

  // Comparison data
  let fromDate: Date | null = null;
  let metrics = {
    criticalCurrent: criticalItems.length,
    criticalPrevious: null as number | null,
    urgentCurrent: urgentItems.length,
    urgentPrevious: null as number | null,
    standardCurrent: standardItems.length,
    standardPrevious: null as number | null,
    tatBreachesCurrent: classified.filter(i => i.tatBreach).length,
    tatBreachesPrevious: null as number | null,
    totalOsCurrent: openSnaps.reduce((s, c) => s + Number(c.totalOs ?? 0), 0),
    totalOsPrevious: null as number | null,
    finalisedCurrent: finalisedSnaps.length,
    finalisedPrevious: null as number | null,
  };

  let wins = { finalisedCount: finalisedSnaps.length, improvedCount: 0, movedOutOfCritical: 0 };
  let resolvedClaims: HandlerPerformancePDFData['resolvedClaims'] = [];
  let stuckClaims: HandlerPerformancePDFData['stuckClaims'] = [];

  if (fromDateStr) {
    fromDate = new Date(fromDateStr);
    const fromSnaps = await prisma.claimSnapshot.findMany({
      where: { handler, snapshotDate: fromDate },
      select: { claimId: true, secondaryStatus: true, daysInCurrentStatus: true, totalOs: true, claimStatus: true },
    });

    const fromOpen = fromSnaps.filter(s => !['Finalised', 'Cancelled', 'Repudiated'].includes(s.claimStatus ?? ''));
    const fromClassified = fromOpen.map(s => ({
      claimId: s.claimId,
      secondaryStatus: s.secondaryStatus,
      priority: priorityFromTat(s.secondaryStatus, s.daysInCurrentStatus, false, tatMap),
      totalOs: Number(s.totalOs ?? 0),
      tatBreach: computeTatBreach(s.secondaryStatus, s.daysInCurrentStatus, tatMap),
    }));

    metrics = {
      ...metrics,
      criticalPrevious: fromClassified.filter(i => i.priority === 'critical').length,
      urgentPrevious: fromClassified.filter(i => i.priority === 'urgent').length,
      standardPrevious: fromClassified.filter(i => i.priority === 'standard').length,
      tatBreachesPrevious: fromClassified.filter(i => i.tatBreach).length,
      totalOsPrevious: fromSnaps.reduce((s, c) => s + Number(c.totalOs ?? 0), 0),
      finalisedPrevious: fromSnaps.filter(s => s.claimStatus?.toLowerCase().includes('finalised')).length,
    };

    const fromMap = new Map(fromClassified.map(i => [i.claimId, i]));
    const toMap = new Map(classified.map(i => [i.claimId, i]));
    const priorityRank: Record<string, number> = { critical: 2, urgent: 1, standard: 0 };

    // Stuck claims
    stuckClaims = classified
      .filter(curr => {
        const prev = fromMap.get(curr.claimId);
        return prev && prev.secondaryStatus === curr.secondaryStatus
          && (curr.priority === 'critical' || curr.priority === 'urgent');
      })
      .map(i => ({ claimId: i.claimId, secondaryStatus: i.secondaryStatus ?? '', daysInStatus: i.daysInStatus, outstanding: i.outstanding }));

    // Resolved/improved
    for (const [claimId, prev] of fromMap) {
      const curr = toMap.get(claimId);
      if (!curr) {
        resolvedClaims.push({ claimId, previousStatus: prev.secondaryStatus ?? '', currentStatus: null, outstanding: prev.totalOs });
        wins.improvedCount++;
      } else if (priorityRank[curr.priority] < priorityRank[prev.priority]) {
        resolvedClaims.push({ claimId, previousStatus: prev.secondaryStatus ?? '', currentStatus: curr.secondaryStatus ?? '', outstanding: curr.outstanding });
        wins.improvedCount++;
        if (prev.priority === 'critical') wins.movedOutOfCritical++;
      }
    }
  }

  // Derive first name
  const firstName = handler.trim().split(' ')[0];
  const compareTo = toDateStr ?? toDate.toISOString().split('T')[0];
  const compareFrom = fromDateStr ?? null;

  // Claims movement
  const registeredInPeriod = await prisma.claimSnapshot.count({
    where: { handler, snapshotDate: toDate, deltaFlags: { path: ['new_claim'], equals: true } },
  }).catch(() => 0);

  return {
    handler,
    firstName,
    reportDate: compareTo,
    compareFrom,
    compareTo,
    metrics,
    wins,
    resolvedClaims: resolvedClaims.slice(0, 30),
    stuckClaims: stuckClaims.slice(0, 30),
    criticalItems: criticalItems.slice(0, 50).map(i => ({
      claimId: i.claimId,
      secondaryStatus: i.secondaryStatus ?? '',
      daysInStatus: i.daysInStatus,
      outstanding: i.outstanding,
      tatStatus: i.tatStatus,
    })),
    urgentItems: urgentItems.slice(0, 100).map(i => ({
      claimId: i.claimId,
      secondaryStatus: i.secondaryStatus ?? '',
      daysInStatus: i.daysInStatus,
      outstanding: i.outstanding,
      tatStatus: i.tatStatus,
    })),
    standardItems: standardItems.slice(0, 200).map(i => ({
      claimId: i.claimId,
      secondaryStatus: i.secondaryStatus ?? '',
      daysInStatus: i.daysInStatus,
      outstanding: i.outstanding,
      tatStatus: i.tatStatus,
    })),
    portfolio,
    registeredInPeriod,
    finalisedInPeriod: finalisedSnaps.length,
  };
}
