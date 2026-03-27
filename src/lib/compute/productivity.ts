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
    finalisationRate: 75,    // % target
    paymentRate: 75,         // % of claims with at least one payment
    zeroActivityPct: 5,      // max % open claims with no activity in 7 days
    avgOsPerClaim: 500,      // ZAR
    reopenRate: 1,           // % max
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
