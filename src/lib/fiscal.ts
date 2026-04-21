/**
 * Fiscal calendar utilities for SEB Hub.
 *
 * FY N: 22 Dec (N−1) → 21 Dec N  (inclusive).
 * Equivalently, Dec 22 of year N is the FIRST day of FY N+1.
 *
 * Monthly buckets (named by the ending calendar month):
 *   Jan bucket: 22 Dec (N−1) → 21 Jan N   (index 0)
 *   Feb bucket: 22 Jan N     → 21 Feb N   (index 1)
 *   …
 *   Dec bucket: 22 Nov N     → 21 Dec N   (index 11)
 */

export interface FyBoundaries {
  fyStart: Date;              // First day of the FY (22 Dec of prior year)
  fyEnd: Date;                // First day of NEXT FY (22 Dec of uwYear) — exclusive upper bound
  currentMonthStart: Date;    // Start of the current UW month window (22nd of prior calendar month)
  currentMonthEnd: Date;      // End of the current UW month window (21st of named calendar month)
  currentMonthLabel: string;  // e.g. "April 2026"
  currentMonthIndex: number;  // 0 = Jan bucket, 11 = Dec bucket
  uwYear: number;             // e.g. 2026
  daysElapsedInFy: number;    // Days from fyStart up to and including asOf
  daysInFy: number;           // Total days in FY (fyStart inclusive → fyEnd exclusive)
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Determine which UW year a given date falls in.
 * Dec 22 of year Y is the first day of FY Y+1, so dates ≥ Dec 22 bump to Y+1.
 */
function uwYearFor(d: Date): number {
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-based
  const day = d.getDate();
  // If month is December (11) and day >= 22, it's the next FY
  if (m === 11 && day >= 22) {
    return y + 1;
  }
  return y;
}

/**
 * Return the start of FY N: 22 Dec of year N−1.
 */
function fyStartForYear(uwYear: number): Date {
  return new Date(uwYear - 1, 11, 22); // Dec 22 of (uwYear - 1)
}

/**
 * Return the first day of FY N+1 (= exclusive end of FY N): 22 Dec of year N.
 */
function fyEndForYear(uwYear: number): Date {
  return new Date(uwYear, 11, 22); // Dec 22 of uwYear
}

/**
 * Given a date, return which month bucket index (0–11) it falls in,
 * and the start/end dates of that bucket.
 *
 * Bucket i corresponds to calendar month (i+1) in the FY's uwYear.
 *   i=0 → Jan: 22 Dec(N−1) → 21 Jan N
 *   i=1 → Feb: 22 Jan N    → 21 Feb N
 *   …
 *   i=11 → Dec: 22 Nov N   → 21 Dec N
 */
function monthBucketFor(d: Date, uwYear: number): {
  index: number;
  start: Date;
  end: Date;
} {
  const fyStart = fyStartForYear(uwYear);
  // Days elapsed since fyStart (0-based)
  const msPerDay = 86400000;
  const daysElapsed = Math.floor((d.getTime() - fyStart.getTime()) / msPerDay);

  // Each bucket runs from the 22nd to the 21st — figure out which calendar month
  // by checking boundaries directly.
  for (let i = 0; i < 12; i++) {
    const { start, end } = bucketDatesForIndex(i, uwYear);
    if (d >= start && d <= end) {
      return { index: i, start, end };
    }
  }

  // Fallback: clamp to last bucket (shouldn't happen within valid FY range)
  void daysElapsed;
  return { index: 11, ...bucketDatesForIndex(11, uwYear) };
}

/**
 * Return the start and end dates for bucket index i within FY uwYear.
 */
function bucketDatesForIndex(i: number, uwYear: number): { start: Date; end: Date } {
  // Bucket i ends on 21st of calendar month (i+1) of uwYear.
  // Bucket i starts on 22nd of calendar month i of uwYear,
  // except for i=0 where it starts on 22 Dec (uwYear-1).
  let startYear: number;
  let startMonth: number; // 0-based
  if (i === 0) {
    startYear = uwYear - 1;
    startMonth = 11; // December
  } else {
    startYear = uwYear;
    startMonth = i - 1; // calendar month index before the ending month
  }

  const start = new Date(startYear, startMonth, 22);
  const end = new Date(uwYear, i, 21); // 21st of calendar month (i+1) in uwYear (month is 0-based: i maps to month index i which is the (i+1)th month)

  // Wait — month index i in Date constructor: new Date(year, month, day) where month is 0-based.
  // The bucket ends on 21st of the (i+1)th month of uwYear.
  // In 0-based: month = i  (Jan=0, Feb=1, ..., Dec=11)
  // So end = new Date(uwYear, i, 21) is correct — i=0 → Jan 21, i=11 → Dec 21.

  return { start, end };
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86400000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

/**
 * Get FY boundaries for a given date (defaults to today).
 */
export function getFyBoundaries(asOf?: Date): FyBoundaries {
  const d = asOf ?? new Date();
  // Normalise to midnight to avoid time-of-day issues
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const uwYear = uwYearFor(day);
  const fyStart = fyStartForYear(uwYear);
  const fyEnd = fyEndForYear(uwYear);

  const { index, start: currentMonthStart, end: currentMonthEnd } = monthBucketFor(day, uwYear);

  // Label uses the name of the ending calendar month (index = calendar month 0-based)
  const currentMonthLabel = `${MONTH_NAMES[index]} ${uwYear}`;

  const daysElapsedInFy = daysBetween(fyStart, day) + 1; // +1 to include asOf
  const daysInFy = daysBetween(fyStart, fyEnd); // exclusive end

  return {
    fyStart,
    fyEnd,
    currentMonthStart,
    currentMonthEnd,
    currentMonthLabel,
    currentMonthIndex: index,
    uwYear,
    daysElapsedInFy,
    daysInFy,
  };
}

/**
 * Get FY boundaries anchored to a specific UW year.
 */
export function getFyBoundariesForYear(uwYear: number): FyBoundaries {
  // Return boundaries as-of the fyStart of that year
  return getFyBoundaries(fyStartForYear(uwYear));
}

/**
 * Return all 12 month windows for a given UW year.
 */
export function getMonthWindowsForFy(uwYear: number): Array<{
  index: number;
  label: string;
  start: Date;
  end: Date;
}> {
  return Array.from({ length: 12 }, (_, i) => {
    const { start, end } = bucketDatesForIndex(i, uwYear);
    return { index: i, label: MONTH_SHORT[i], start, end };
  });
}
