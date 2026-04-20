import { prisma } from '@/lib/prisma';

export interface TeamSummaryReportData {
  dateRange: string;
  snapshotDate: string;
  kpis: { totalOpen: number; totalFinalised: number; avgTatCompliance: number; totalWipScore: number };
  handlers: Array<{ handler: string; open: number; finalised: number; tatCompliance: number }>;
  topBrokers: Array<{ broker: string; claimCount: number }>;
  flagSummary: Array<{ flagType: string; count: number }>;
}

export async function fetchTeamSummaryData(dateRange: string): Promise<TeamSummaryReportData> {
  const latest = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true, importRunId: true },
  });
  const snapshotDate = latest
    ? new Date(latest.snapshotDate).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  const snapshots = await prisma.claimSnapshot.findMany({
    where: { snapshotDate: latest ? latest.snapshotDate : new Date() },
    select: { handler: true, claimStatus: true, isTatBreach: true, broker: true },
  });

  const open = snapshots.filter(s => !s.claimStatus?.toLowerCase().includes('finalised'));
  const finalised = snapshots.filter(s => s.claimStatus?.toLowerCase().includes('finalised'));
  const tatBreaches = open.filter(s => s.isTatBreach).length;

  // By handler
  const handlerMap = new Map<string, { open: number; finalised: number; breaches: number }>();
  for (const s of snapshots) {
    const h = s.handler ?? 'Unknown';
    if (!handlerMap.has(h)) handlerMap.set(h, { open: 0, finalised: 0, breaches: 0 });
    const r = handlerMap.get(h)!;
    if (s.claimStatus?.toLowerCase().includes('finalised')) r.finalised++;
    else { r.open++; if (s.isTatBreach) r.breaches++; }
  }

  // Top brokers
  const brokerMap = new Map<string, number>();
  for (const s of snapshots) {
    const b = s.broker ?? 'Unknown';
    brokerMap.set(b, (brokerMap.get(b) ?? 0) + 1);
  }
  const topBrokers = Array.from(brokerMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([broker, claimCount]) => ({ broker, claimCount }));

  const importRunId = latest?.importRunId;
  const flags = importRunId
    ? await prisma.claimFlag.groupBy({
        by: ['flagType'],
        _count: { flagType: true },
        where: { importRunId },
      })
    : [];

  return {
    dateRange,
    snapshotDate,
    kpis: {
      totalOpen: open.length,
      totalFinalised: finalised.length,
      avgTatCompliance: open.length > 0 ? Math.round(((open.length - tatBreaches) / open.length) * 100) : 100,
      totalWipScore: open.length,
    },
    handlers: Array.from(handlerMap.entries()).map(([handler, v]) => ({
      handler,
      open: v.open,
      finalised: v.finalised,
      tatCompliance: v.open > 0 ? Math.round(((v.open - v.breaches) / v.open) * 100) : 100,
    })),
    topBrokers,
    flagSummary: flags.map(f => ({ flagType: f.flagType, count: f._count.flagType })),
  };
}
