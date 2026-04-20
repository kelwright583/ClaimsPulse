import { prisma } from '@/lib/prisma';

export interface BrokerPerformanceReportData {
  dateRange: string;
  snapshotDate: string;
  broker?: string;
  brokers: Array<{
    broker: string;
    claimCount: number;
    avgClaimSize: number;
    tatCompliance: number;
    bigClaimsCount: number;
    totalOs: number;
  }>;
}

const BIG_CLAIM_THRESHOLD = 500000;

export async function fetchBrokerPerformanceData(dateRange: string, broker?: string): Promise<BrokerPerformanceReportData> {
  const latest = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  const snapshotDate = latest
    ? new Date(latest.snapshotDate).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  const where = {
    snapshotDate: latest ? latest.snapshotDate : new Date(),
    NOT: { claimStatus: { contains: 'Finalised' } },
    ...(broker ? { broker } : {}),
  };

  const snapshots = await prisma.claimSnapshot.findMany({
    where,
    select: {
      broker: true,
      totalIncurred: true,
      totalOs: true,
      isTatBreach: true,
    },
  });

  const brokerMap = new Map<string, {
    claims: number;
    sumIncurred: number;
    breaches: number;
    bigClaims: number;
    totalOs: number;
  }>();

  for (const s of snapshots) {
    const b = s.broker ?? 'Unknown';
    const cur = brokerMap.get(b) ?? { claims: 0, sumIncurred: 0, breaches: 0, bigClaims: 0, totalOs: 0 };
    const incurred = Number(s.totalIncurred ?? 0);
    brokerMap.set(b, {
      claims: cur.claims + 1,
      sumIncurred: cur.sumIncurred + incurred,
      breaches: cur.breaches + (s.isTatBreach ? 1 : 0),
      bigClaims: cur.bigClaims + (incurred >= BIG_CLAIM_THRESHOLD ? 1 : 0),
      totalOs: cur.totalOs + Number(s.totalOs ?? 0),
    });
  }

  const brokers = Array.from(brokerMap.entries())
    .map(([b, v]) => ({
      broker: b,
      claimCount: v.claims,
      avgClaimSize: v.claims > 0 ? v.sumIncurred / v.claims : 0,
      tatCompliance: v.claims > 0 ? Math.round(((v.claims - v.breaches) / v.claims) * 100) : 100,
      bigClaimsCount: v.bigClaims,
      totalOs: v.totalOs,
    }))
    .sort((a, b) => b.claimCount - a.claimCount);

  return {
    dateRange,
    snapshotDate,
    broker,
    brokers,
  };
}
