export const COMPLEXITY_WEIGHTS: Record<string, number> = {
  'Windscreen': 1,
  'Glass Only': 1,
  'Accident damage': 22,
  'Hail': 15,
  'Storm': 15,
  'Fire': 15,
  'Malicious damage': 10,
  'Theft of accessories': 7,
  'Theft of vehicle spares / parts': 7,
  'Theft - forcible entry': 30,
  'Theft - non forcible entry': 30,
  'Vehicle theft': 57,
  'Vehicle hijack': 64,
  'Business All Risk': 3,
  'Loss Of Stock': 11,
  'Third Party Liability': 40,
};

export const DEFAULT_WEIGHT = 5;

export const GLASS_CAUSES = new Set(['Windscreen', 'Glass Only']);

export const THEFT_CAUSES = new Set(['Vehicle theft', 'Vehicle hijack']);

export const PRODUCTIVITY_BENCHMARKS = {
  glass: {
    finalisationRate: 75,
    paymentRate: 75,
    zeroActivityPct: 5,
    avgOsPerClaim: 500,
    reopenRate: 1,
  },
  complex: {
    finalisationRate: 35,
    paymentRate: 70,
    zeroActivityPct: 5,
    avgOsPerClaim: 20000,
    reopenRate: 5,
  },
  theft: {
    finalisationRate: 35,
    paymentRate: 60,
    zeroActivityPct: 3,
    avgOsPerClaim: 30000,
    reopenRate: 5,
  },
};

export type PortfolioCategory = 'glass' | 'theft' | 'complex';

export function getPortfolioCategory(cause: string | null): PortfolioCategory {
  if (!cause) return 'complex';
  if (GLASS_CAUSES.has(cause)) return 'glass';
  if (THEFT_CAUSES.has(cause)) return 'theft';
  return 'complex';
}

const CLOSED_STATUSES = new Set(['Finalised', 'Repudiated', 'Cancelled']);

export interface HandlerSnapshot {
  claimId: string;
  claimStatus: string | null;
  secondaryStatus: string | null;
  cause: string | null;
  totalOs: number;
  deltaFlags: string[];
  daysInCurrentStatus: number | null;
  complexityWeight: number | null;
}

export interface HandlerMetrics {
  handler: string;
  totalClaims: number;
  openClaims: number;
  finalisedCount: number;
  finalisationRate: number;
  paymentRate: number;
  zeroActivityPct: number;
  avgOsPerClaim: number;
  reopenRate: number;
  complexityScore: number;
  dominantCategory: PortfolioCategory;
  benchmark: typeof PRODUCTIVITY_BENCHMARKS.complex;
  // per-metric scores as % of benchmark (100 = on target, >100 = exceeds)
  scores: {
    finalisationScore: number;
    paymentScore: number;
    zeroActivityScore: number;  // inverted: lower is better
    avgOsScore: number;         // inverted: lower is better
    reopenScore: number;        // inverted: lower is better
  };
}

export function computeHandlerMetrics(
  handler: string,
  snapshots: HandlerSnapshot[],
  paymentClaimIds: Set<string>,
): HandlerMetrics {
  const totalClaims = snapshots.length;

  const openSnapshots = snapshots.filter(
    s => !CLOSED_STATUSES.has(s.claimStatus ?? ''),
  );
  const openClaims = openSnapshots.length;

  const finalisedCount = snapshots.filter(
    s => s.claimStatus === 'Finalised',
  ).length;

  const finalisationRate =
    totalClaims > 0 ? (finalisedCount / totalClaims) * 100 : 0;

  // Payment rate: % of open claims that have at least one payment
  const openWithPayment = openSnapshots.filter(s =>
    paymentClaimIds.has(s.claimId),
  ).length;
  const paymentRate =
    openClaims > 0 ? (openWithPayment / openClaims) * 100 : 0;

  // Zero activity: open claims with no delta flags and days_in_current_status > 7
  const zeroActivity = openSnapshots.filter(
    s => (s.daysInCurrentStatus ?? 0) > 7 && s.deltaFlags.length === 0,
  ).length;
  const zeroActivityPct =
    openClaims > 0 ? (zeroActivity / openClaims) * 100 : 0;

  // Avg outstanding per open claim
  const totalOs = openSnapshots.reduce((sum, s) => sum + s.totalOs, 0);
  const avgOsPerClaim = openClaims > 0 ? totalOs / openClaims : 0;

  // Reopen rate
  const reopened = snapshots.filter(s =>
    s.deltaFlags.includes('reopened'),
  ).length;
  const reopenRate = totalClaims > 0 ? (reopened / totalClaims) * 100 : 0;

  // Complexity-weighted portfolio score
  const complexityScore = openSnapshots.reduce(
    (sum, s) => sum + (s.complexityWeight ?? DEFAULT_WEIGHT),
    0,
  );

  // Dominant portfolio category by claim count
  const counts: Record<PortfolioCategory, number> = {
    glass: 0,
    theft: 0,
    complex: 0,
  };
  for (const s of openSnapshots) {
    counts[getPortfolioCategory(s.cause)]++;
  }
  const dominantCategory = (
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as PortfolioCategory
  );

  const benchmark = PRODUCTIVITY_BENCHMARKS[dominantCategory];

  // Normalised scores (100 = exactly on benchmark)
  const finalisationScore =
    benchmark.finalisationRate > 0
      ? (finalisationRate / benchmark.finalisationRate) * 100
      : 0;
  const paymentScore =
    benchmark.paymentRate > 0
      ? (paymentRate / benchmark.paymentRate) * 100
      : 0;
  // For inverted metrics: score 100 when at benchmark, 0 when 2x benchmark
  const zeroActivityScore =
    benchmark.zeroActivityPct > 0
      ? Math.max(0, 100 - ((zeroActivityPct / benchmark.zeroActivityPct) - 1) * 100)
      : 100;
  const avgOsScore =
    benchmark.avgOsPerClaim > 0
      ? Math.max(0, 100 - ((avgOsPerClaim / benchmark.avgOsPerClaim) - 1) * 100)
      : 100;
  const reopenScore =
    benchmark.reopenRate > 0
      ? Math.max(0, 100 - ((reopenRate / benchmark.reopenRate) - 1) * 100)
      : 100;

  return {
    handler,
    totalClaims,
    openClaims,
    finalisedCount,
    finalisationRate,
    paymentRate,
    zeroActivityPct,
    avgOsPerClaim,
    reopenRate,
    complexityScore,
    dominantCategory,
    benchmark,
    scores: {
      finalisationScore,
      paymentScore,
      zeroActivityScore,
      avgOsScore,
      reopenScore,
    },
  };
}
