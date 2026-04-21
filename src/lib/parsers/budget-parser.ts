/**
 * budget-parser.ts
 *
 * Parses SEB_B2026_sign-off_BV.xlsx (IFRS4 income-statement workbook).
 *
 * NOTE: The actual file structure was inspected prior to writing this parser.
 * The file was not present on the development machine at implementation time;
 * the parser is built to match the described layout:
 *   - Primary sheet: "Inc Stm after all changes"
 *   - Fallback sheet: "Income Statement IFRS4"
 *   - Header row detected by finding "Total Year" + "Jan" … "Dec" in same row
 *   - Line items searched case-insensitively by label in leftmost columns
 *
 * IMPORTANT: If the workbook layout changes, adjust SHEET_PRIMARY, SHEET_FALLBACK,
 * METRIC_LABELS, and the header-detection logic below.
 */

import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHEET_PRIMARY  = 'Inc Stm after all changes';
const SHEET_FALLBACK = 'Income Statement IFRS4';

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;

/** Maps spreadsheet row label (lower-cased, trimmed) → metricType */
const METRIC_LABELS: Record<string, BudgetMetricType> = {
  'gross written premium':    'gwp_budget',
  'gross claims':             'gross_claims_budget',
  'gross earned commission':  'gross_commission_budget',
  'expenses':                 'expenses_budget',
};

type BudgetMetricType =
  | 'gwp_budget'
  | 'gross_claims_budget'
  | 'gross_commission_budget'
  | 'expenses_budget';

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface BudgetMonthlyEntry {
  monthIndex: number;   // 1–12
  monthLabel: string;   // 'Jan' … 'Dec'
  value: number;
}

export interface BudgetRow {
  metricType: BudgetMetricType;
  annualTotal: number;
  monthly: BudgetMonthlyEntry[];
}

export interface BudgetParseResult {
  uwYear: number;
  sheetUsed: string;
  sourceVersion: string | null;
  managementUnit: string | null;
  rows: BudgetRow[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNumber(cell: XLSX.CellObject | undefined): number | null {
  if (!cell) return null;
  if (cell.t === 'n') return cell.v as number;
  if (cell.t === 's') {
    const cleaned = String(cell.v).replace(/[,\s]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

function cellStr(ws: XLSX.WorkSheet, col: number, row: number): string {
  const addr = XLSX.utils.encode_cell({ c: col, r: row });
  const cell = ws[addr] as XLSX.CellObject | undefined;
  if (!cell) return '';
  return String(cell.v ?? '').trim();
}

function cellNum(ws: XLSX.WorkSheet, col: number, row: number): number | null {
  const addr = XLSX.utils.encode_cell({ c: col, r: row });
  return toNumber(ws[addr] as XLSX.CellObject | undefined);
}

/** Returns the decoded range of a worksheet (0-based row/col). */
function wsRange(ws: XLSX.WorkSheet): XLSX.Range {
  const ref = ws['!ref'];
  if (!ref) return { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  return XLSX.utils.decode_range(ref);
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

/**
 * Parses the IFRS4 income-statement workbook buffer and returns structured
 * budget data with validation.
 *
 * @param buffer  ArrayBuffer of the .xlsx file
 * @param confirmedUwYear  Optional year provided by the caller (for cross-check)
 */
export function parseBudgetReport(
  buffer: ArrayBuffer,
  confirmedUwYear?: number,
): BudgetParseResult {
  const warnings: string[] = [];

  // ------------------------------------------------------------------
  // Load workbook
  // ------------------------------------------------------------------
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });

  // ------------------------------------------------------------------
  // Sheet selection
  // ------------------------------------------------------------------
  let sheetUsed: string;
  let ws: XLSX.WorkSheet;

  if (wb.SheetNames.includes(SHEET_PRIMARY)) {
    sheetUsed = SHEET_PRIMARY;
    ws = wb.Sheets[SHEET_PRIMARY];
  } else if (wb.SheetNames.includes(SHEET_FALLBACK)) {
    warnings.push(
      `Primary sheet "${SHEET_PRIMARY}" not found. ` +
      `Falling back to "${SHEET_FALLBACK}".`,
    );
    sheetUsed = SHEET_FALLBACK;
    ws = wb.Sheets[SHEET_FALLBACK];
  } else {
    throw new Error(
      `Neither "${SHEET_PRIMARY}" nor "${SHEET_FALLBACK}" found in workbook. ` +
      `Available sheets: ${wb.SheetNames.join(', ')}`,
    );
  }

  const range = wsRange(ws);

  // ------------------------------------------------------------------
  // Extract uwYear, managementUnit, sourceVersion from early rows
  // We scan the first 20 rows looking for:
  //   - A cell containing a 4-digit year (2024–2030)
  //   - Cells with labels like "Management Unit", "Version"
  // ------------------------------------------------------------------
  let uwYear: number | null = null;
  let managementUnit: string | null = null;
  let sourceVersion: string | null = null;

  for (let r = 0; r <= Math.min(range.e.r, 30); r++) {
    for (let c = 0; c <= Math.min(range.e.c, 10); c++) {
      const val = cellStr(ws, c, r);
      const numVal = cellNum(ws, c, r);

      // Year value
      if (uwYear === null) {
        const yearMatch = val.match(/\b(202\d|203\d)\b/);
        if (yearMatch) {
          uwYear = parseInt(yearMatch[1], 10);
        } else if (numVal !== null && numVal >= 2024 && numVal <= 2035 && Number.isInteger(numVal)) {
          uwYear = numVal;
        }
      }

      // Management unit
      const lc = val.toLowerCase();
      if (managementUnit === null && lc.includes('management unit')) {
        // Value is likely in the cell to the right
        managementUnit = cellStr(ws, c + 1, r) || cellStr(ws, c + 2, r) || null;
      }

      // Source version
      if (sourceVersion === null && (lc.includes('version') || lc.includes('sign-off') || lc.includes('sign off'))) {
        sourceVersion = val;
      }
    }
  }

  // ------------------------------------------------------------------
  // Detect header row: find row with "Total Year" and all 12 months
  // ------------------------------------------------------------------
  let headerRow = -1;
  let totalYearCol = -1;
  let monthCols: number[] = [];

  outerLoop:
  for (let r = 0; r <= Math.min(range.e.r, 60); r++) {
    const rowVals: string[] = [];
    for (let c = 0; c <= range.e.c; c++) {
      rowVals.push(cellStr(ws, c, r).toLowerCase());
    }

    // Find "Total Year" column
    const totalCol = rowVals.findIndex(v => v.replace(/\s+/g, ' ').includes('total year'));
    if (totalCol === -1) continue;

    // Find all 12 month columns
    const monthIdxMap: Map<string, number> = new Map();
    for (let c = 0; c <= range.e.c; c++) {
      const v = rowVals[c];
      for (const m of MONTH_LABELS) {
        if (v === m.toLowerCase() && !monthIdxMap.has(m)) {
          monthIdxMap.set(m, c);
          break;
        }
      }
    }

    if (monthIdxMap.size === 12) {
      headerRow   = r;
      totalYearCol = totalCol;
      monthCols   = MONTH_LABELS.map(m => monthIdxMap.get(m)!);
      break outerLoop;
    }
  }

  if (headerRow === -1) {
    throw new Error(
      `Could not detect header row in sheet "${sheetUsed}". ` +
      `Expected a row containing "Total Year" and all 12 month abbreviations (Jan … Dec).`,
    );
  }

  // ------------------------------------------------------------------
  // Extract line-item rows
  // ------------------------------------------------------------------
  const foundMetrics = new Map<BudgetMetricType, { annualTotal: number; monthly: BudgetMonthlyEntry[] }>();

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    // Scan label columns (first ~4 columns)
    let rowLabel = '';
    for (let c = 0; c <= Math.min(range.e.c, 5); c++) {
      const v = cellStr(ws, c, r).toLowerCase().trim();
      if (v.length > 0) { rowLabel = v; break; }
    }
    if (!rowLabel) continue;

    const metricType = METRIC_LABELS[rowLabel];
    if (!metricType) continue;
    if (foundMetrics.has(metricType)) continue; // Use first occurrence only

    const annualRaw = cellNum(ws, totalYearCol, r);
    const annualTotal = annualRaw ?? 0;

    const monthly: BudgetMonthlyEntry[] = MONTH_LABELS.map((label, i) => ({
      monthIndex: i + 1,
      monthLabel: label,
      value: cellNum(ws, monthCols[i], r) ?? 0,
    }));

    foundMetrics.set(metricType, { annualTotal, monthly });
  }

  // ------------------------------------------------------------------
  // Validate: all four metrics must be present
  // ------------------------------------------------------------------
  const requiredMetrics: BudgetMetricType[] = [
    'gwp_budget',
    'gross_claims_budget',
    'gross_commission_budget',
    'expenses_budget',
  ];

  const missingMetrics = requiredMetrics.filter(m => !foundMetrics.has(m));
  if (missingMetrics.length > 0) {
    throw new Error(
      `Missing required line items in sheet "${sheetUsed}": ` +
      missingMetrics.join(', ') +
      `. Searched for: ${Object.keys(METRIC_LABELS).join(', ')}.`,
    );
  }

  // ------------------------------------------------------------------
  // Validate: monthly sums must equal annualTotal within ZAR 10
  // ------------------------------------------------------------------
  for (const [metricType, data] of foundMetrics) {
    const monthlySum = data.monthly.reduce((acc, m) => acc + m.value, 0);
    const diff = Math.abs(monthlySum - data.annualTotal);
    if (diff > 10) {
      throw new Error(
        `Validation failed for "${metricType}": ` +
        `monthly sum ${monthlySum.toFixed(2)} differs from annual total ${data.annualTotal.toFixed(2)} ` +
        `by ZAR ${diff.toFixed(2)} (tolerance: ZAR 10).`,
      );
    }
  }

  // ------------------------------------------------------------------
  // UW year fallback and cross-check
  // ------------------------------------------------------------------
  if (uwYear === null) {
    if (confirmedUwYear != null) {
      warnings.push(
        `Could not detect a year value in the workbook. Using caller-supplied uwYear ${confirmedUwYear}.`,
      );
      uwYear = confirmedUwYear;
    } else {
      throw new Error(
        `Could not detect a UW year in the workbook and no uwYear was supplied. ` +
        `Please provide the uwYear query parameter.`,
      );
    }
  } else if (confirmedUwYear != null && confirmedUwYear !== uwYear) {
    warnings.push(
      `Workbook year (${uwYear}) does not match caller-supplied uwYear (${confirmedUwYear}). ` +
      `Using workbook year ${uwYear}.`,
    );
  }

  // ------------------------------------------------------------------
  // Build result
  // ------------------------------------------------------------------
  const rows: BudgetRow[] = requiredMetrics.map(metricType => {
    const d = foundMetrics.get(metricType)!;
    return { metricType, annualTotal: d.annualTotal, monthly: d.monthly };
  });

  return {
    uwYear,
    sheetUsed,
    sourceVersion,
    managementUnit,
    rows,
    warnings,
  };
}
