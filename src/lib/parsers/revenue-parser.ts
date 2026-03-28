import * as XLSX from 'xlsx';
import { parseAccountingNumber } from '@/lib/utils';

export interface MappedRevenueRow {
  month: string;
  periodDate: Date;
  branch: string | null;
  classCode: string | null;
  className: string | null;
  product: string | null;
  broker: string | null;
  policyNumber: string | null;
  insured: string | null;
  uwYear: number | null;
  endorsementType: string | null;
  gwp: number | null;
  netWp: number | null;
  quotaShareWp: number | null;
  gwpVat: number | null;
  grossComm: number | null;
  netComm: number | null;
  grossCommPct: number | null;
}

export interface RevenueParserResult {
  rows: MappedRevenueRow[];
  periodDate: Date;
  month: string;
}

function toNum(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  return parseAccountingNumber(String(value));
}

const MONTH_NAMES: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
  sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

function extractPeriodFromSheet(sheet: XLSX.WorkSheet): { periodDate: Date; month: string } {
  const ref = sheet['!ref'];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    // Scan first 3 rows for a date
    for (let r = 0; r < 3; r++) {
      for (let c = range.s.c; c <= Math.min(range.e.c, 10); c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell?.v) continue;
        const str = String(cell.v);
        // "April 2026", "Apr 2026", "Apr-2026"
        const longMatch = str.match(/([A-Za-z]+)\s*[-–]?\s*(\d{4})/);
        if (longMatch) {
          const monthIdx = MONTH_NAMES[longMatch[1].toLowerCase()];
          const year = parseInt(longMatch[2], 10);
          if (monthIdx !== undefined && !isNaN(year) && year > 2000) {
            const d = new Date(year, monthIdx, 1);
            const monthLabel = longMatch[1].charAt(0).toUpperCase() + longMatch[1].slice(1).toLowerCase();
            return { periodDate: d, month: `${monthLabel} ${year}` };
          }
        }
        // "DD Month YYYY"
        const fullMatch = str.match(/\d{1,2}\s+([A-Za-z]+)\s+(\d{4})/);
        if (fullMatch) {
          const monthIdx = MONTH_NAMES[fullMatch[1].toLowerCase()];
          const year = parseInt(fullMatch[2], 10);
          if (monthIdx !== undefined && !isNaN(year)) {
            const d = new Date(year, monthIdx, 1);
            const monthLabel = fullMatch[1].charAt(0).toUpperCase() + fullMatch[1].slice(1).toLowerCase();
            return { periodDate: d, month: `${monthLabel} ${year}` };
          }
        }
      }
    }
  }
  // Default: first day of current month
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    periodDate: d,
    month: d.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }),
  };
}

// Column name aliases — handles various report header naming conventions
const COL_ALIASES: Record<string, string[]> = {
  branch: ['Branch', 'branch'],
  classCode: ['Class Code', 'Class', 'Cls Code', 'ClassCode'],
  className: ['Class Name', 'Class Description', 'Cls Name', 'Class Desc'],
  product: ['Product', 'Product Description'],
  broker: ['Broker', 'Broker Name', 'Broker Desc'],
  policyNumber: ['Policy', 'Policy Number', 'Policy No', 'Policy No.'],
  insured: ['Insured', 'Insured Name', 'Insured Desc'],
  uwYear: ['UW Year', 'UW Yr', 'Underwriting Year', 'U/W Year'],
  endorsementType: ['Endorsement Type', 'Endorse Type', 'Trans Type', 'Transaction Type', 'Type'],
  gwp: ['GWP', 'Gross WP', 'Gross Written Premium', 'GWP Incl VAT'],
  netWp: ['Net WP', 'Net Written Premium', 'NWP', 'Net Prem'],
  quotaShareWp: ['Quota Share WP', 'QS WP', 'Quota WP'],
  gwpVat: ['GWP VAT', 'GWP Vat', 'VAT on GWP'],
  grossComm: ['Gross Comm', 'Gross Commission', 'Gross Com'],
  netComm: ['Net Comm', 'Net Commission', 'Net Com'],
  grossCommPct: ['Gross Comm %', 'Gross Comm Pct', 'Comm %', 'Comm Pct'],
};

function resolveCol(row: Record<string, unknown>, field: string): unknown {
  const aliases = COL_ALIASES[field] ?? [field];
  for (const alias of aliases) {
    if (row[alias] !== undefined) return row[alias];
  }
  return null;
}

export function parseRevenueReport(buffer: ArrayBuffer): RevenueParserResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const { periodDate, month } = extractPeriodFromSheet(sheet);

  // Try different header row offsets: 0, 1, 2
  let rows: Record<string, unknown>[] = [];
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');

  for (const offset of [0, 1, 2]) {
    const testRange = { ...range, s: { ...range.s, r: offset } };
    const testSheet = { ...sheet, '!ref': XLSX.utils.encode_range(testRange) };
    const testRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(testSheet, { defval: null, raw: false });
    if (testRows.length > 0) {
      const keys = Object.keys(testRows[0]);
      // Check if this looks like a data row (has at least one of our expected columns)
      const hasExpected = ['GWP', 'Net WP', 'Broker', 'Policy', 'Class', 'Gross WP', 'NWP'].some(k => keys.includes(k));
      if (hasExpected) {
        rows = testRows;
        break;
      }
    }
  }

  // Fallback: use row 0
  if (rows.length === 0) {
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
  }

  const mapped: MappedRevenueRow[] = rows
    .filter(r => {
      // Filter out header/total rows by checking if GWP field looks numeric
      const gwpVal = resolveCol(r, 'gwp');
      if (gwpVal == null) return false;
      const n = toNum(gwpVal);
      return n !== null;
    })
    .map((r): MappedRevenueRow => {
      const uwYearRaw = resolveCol(r, 'uwYear');
      const gwpPctRaw = resolveCol(r, 'grossCommPct');

      return {
        month,
        periodDate,
        branch: resolveCol(r, 'branch') ? String(resolveCol(r, 'branch')).trim() : null,
        classCode: resolveCol(r, 'classCode') ? String(resolveCol(r, 'classCode')).trim() : null,
        className: resolveCol(r, 'className') ? String(resolveCol(r, 'className')).trim() : null,
        product: resolveCol(r, 'product') ? String(resolveCol(r, 'product')).trim() : null,
        broker: resolveCol(r, 'broker') ? String(resolveCol(r, 'broker')).trim() : null,
        policyNumber: resolveCol(r, 'policyNumber') ? String(resolveCol(r, 'policyNumber')).trim() : null,
        insured: resolveCol(r, 'insured') ? String(resolveCol(r, 'insured')).trim() : null,
        uwYear: uwYearRaw ? parseInt(String(uwYearRaw), 10) || null : null,
        endorsementType: resolveCol(r, 'endorsementType') ? String(resolveCol(r, 'endorsementType')).trim() : null,
        gwp: toNum(resolveCol(r, 'gwp')),
        netWp: toNum(resolveCol(r, 'netWp')),
        quotaShareWp: toNum(resolveCol(r, 'quotaShareWp')),
        gwpVat: toNum(resolveCol(r, 'gwpVat')),
        grossComm: toNum(resolveCol(r, 'grossComm')),
        netComm: toNum(resolveCol(r, 'netComm')),
        grossCommPct: gwpPctRaw != null ? toNum(gwpPctRaw) : null,
      };
    });

  return { rows: mapped, periodDate, month };
}
