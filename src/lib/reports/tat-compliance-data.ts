import { prisma } from '@/lib/prisma';

export interface TatComplianceReportData {
  dateRange: string;
  snapshotDate: string;
  overallCompliance: number;
  totalOpen: number;
  totalBreaches: number;
  bySecondaryStatus: Array<{ status: string; total: number; breaches: number; compliance: number }>;
  byHandler: Array<{ handler: string; total: number; breaches: number; compliance: number }>;
  breachList: Array<{ claimId: string; handler: string; secondaryStatus: string; daysInStatus: number }>;
}

export async function fetchTatComplianceData(dateRange: string): Promise<TatComplianceReportData> {
  const latest = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  const snapshotDate = latest
    ? new Date(latest.snapshotDate).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  const snapshots = await prisma.claimSnapshot.findMany({
    where: {
      snapshotDate: latest ? latest.snapshotDate : new Date(),
      NOT: { claimStatus: { contains: 'Finalised' } },
    },
    select: {
      claimId: true,
      handler: true,
      secondaryStatus: true,
      isTatBreach: true,
      daysInCurrentStatus: true,
    },
  });

  const totalOpen = snapshots.length;
  const totalBreaches = snapshots.filter(s => s.isTatBreach).length;
  const overallCompliance = totalOpen > 0 ? Math.round(((totalOpen - totalBreaches) / totalOpen) * 100) : 100;

  // By secondary status
  const statusMap = new Map<string, { total: number; breaches: number }>();
  for (const s of snapshots) {
    const st = s.secondaryStatus ?? 'Unknown';
    const cur = statusMap.get(st) ?? { total: 0, breaches: 0 };
    statusMap.set(st, { total: cur.total + 1, breaches: cur.breaches + (s.isTatBreach ? 1 : 0) });
  }

  // By handler
  const handlerMap = new Map<string, { total: number; breaches: number }>();
  for (const s of snapshots) {
    const h = s.handler ?? 'Unknown';
    const cur = handlerMap.get(h) ?? { total: 0, breaches: 0 };
    handlerMap.set(h, { total: cur.total + 1, breaches: cur.breaches + (s.isTatBreach ? 1 : 0) });
  }

  // Breach list (top 20)
  const breachList = snapshots
    .filter(s => s.isTatBreach)
    .sort((a, b) => (b.daysInCurrentStatus ?? 0) - (a.daysInCurrentStatus ?? 0))
    .slice(0, 20)
    .map(s => ({
      claimId: s.claimId,
      handler: s.handler ?? 'Unknown',
      secondaryStatus: s.secondaryStatus ?? 'Unknown',
      daysInStatus: s.daysInCurrentStatus ?? 0,
    }));

  return {
    dateRange,
    snapshotDate,
    overallCompliance,
    totalOpen,
    totalBreaches,
    bySecondaryStatus: Array.from(statusMap.entries()).map(([status, v]) => ({
      status,
      ...v,
      compliance: v.total > 0 ? Math.round(((v.total - v.breaches) / v.total) * 100) : 100,
    })).sort((a, b) => a.compliance - b.compliance),
    byHandler: Array.from(handlerMap.entries()).map(([handler, v]) => ({
      handler,
      ...v,
      compliance: v.total > 0 ? Math.round(((v.total - v.breaches) / v.total) * 100) : 100,
    })).sort((a, b) => a.compliance - b.compliance),
    breachList,
  };
}
