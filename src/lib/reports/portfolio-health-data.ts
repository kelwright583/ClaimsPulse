import { prisma } from '@/lib/prisma';

export interface PortfolioHealthReportData {
  dateRange: string;
  snapshotDate: string;
  productLine?: string;
  byStatus: Array<{ status: string; count: number; totalOs: number }>;
  byAgeBucket: Array<{ bucket: string; count: number }>;
  byCause: Array<{ cause: string; count: number; totalOs: number }>;
  byProduct: Array<{ productLine: string; count: number; totalOs: number }>;
  totalOs: number;
  totalOpen: number;
}

function getAgeBucket(days: number | null): string {
  const d = days ?? 0;
  if (d <= 7) return '0-7 days';
  if (d <= 30) return '8-30 days';
  if (d <= 90) return '31-90 days';
  return '90+ days';
}

export async function fetchPortfolioHealthData(dateRange: string, productLine?: string): Promise<PortfolioHealthReportData> {
  const latest = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  const snapshotDate = latest
    ? new Date(latest.snapshotDate).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  const where = {
    snapshotDate: latest ? latest.snapshotDate : new Date(),
    ...(productLine ? { productLine } : {}),
  };

  const snapshots = await prisma.claimSnapshot.findMany({
    where,
    select: {
      claimStatus: true,
      daysOpen: true,
      cause: true,
      productLine: true,
      totalOs: true,
    },
  });

  const open = snapshots.filter(s => !s.claimStatus?.toLowerCase().includes('finalised'));
  const totalOs = open.reduce((sum, s) => sum + Number(s.totalOs ?? 0), 0);

  // By status
  const statusMap = new Map<string, { count: number; totalOs: number }>();
  for (const s of open) {
    const st = s.claimStatus ?? 'Unknown';
    const cur = statusMap.get(st) ?? { count: 0, totalOs: 0 };
    statusMap.set(st, { count: cur.count + 1, totalOs: cur.totalOs + Number(s.totalOs ?? 0) });
  }

  // By age bucket
  const ageMap = new Map<string, number>();
  for (const s of open) {
    const bucket = getAgeBucket(s.daysOpen);
    ageMap.set(bucket, (ageMap.get(bucket) ?? 0) + 1);
  }

  // By cause
  const causeMap = new Map<string, { count: number; totalOs: number }>();
  for (const s of open) {
    const c = s.cause ?? 'Unknown';
    const cur = causeMap.get(c) ?? { count: 0, totalOs: 0 };
    causeMap.set(c, { count: cur.count + 1, totalOs: cur.totalOs + Number(s.totalOs ?? 0) });
  }

  // By product
  const productMap = new Map<string, { count: number; totalOs: number }>();
  for (const s of open) {
    const p = s.productLine ?? 'Unknown';
    const cur = productMap.get(p) ?? { count: 0, totalOs: 0 };
    productMap.set(p, { count: cur.count + 1, totalOs: cur.totalOs + Number(s.totalOs ?? 0) });
  }

  return {
    dateRange,
    snapshotDate,
    productLine,
    byStatus: Array.from(statusMap.entries()).map(([status, v]) => ({ status, ...v })).sort((a, b) => b.count - a.count),
    byAgeBucket: Array.from(ageMap.entries()).map(([bucket, count]) => ({ bucket, count })),
    byCause: Array.from(causeMap.entries()).map(([cause, v]) => ({ cause, ...v })).sort((a, b) => b.count - a.count).slice(0, 10),
    byProduct: Array.from(productMap.entries()).map(([productLine, v]) => ({ productLine, ...v })).sort((a, b) => b.count - a.count),
    totalOs,
    totalOpen: open.length,
  };
}
