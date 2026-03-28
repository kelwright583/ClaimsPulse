import * as XLSX from 'xlsx';
import { parseAccountingNumber } from '@/lib/utils';

export interface FinancialSummaryRow {
  period: string;
  periodDate: Date;
  section: string;
  level: string;
  metric: string;
  value: number;
}

export interface MovementParserResult {
  rows: FinancialSummaryRow[];
  periodDate: Date;
  period: string;
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  return parseAccountingNumber(String(v)) ?? 0;
}

const MONTH_NAMES: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
  sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

function detectPeriod(sheet: XLSX.WorkSheet): { periodDate: Date; period: string } {
  const ref = sheet['!ref'];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let r = 0; r < 5; r++) {
      for (let c = range.s.c; c <= Math.min(range.e.c, 15); c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell?.v) continue;
        const str = String(cell.v);
        const m = str.match(/([A-Za-z]+)\s+(\d{4})/);
        if (m) {
          const monthIdx = MONTH_NAMES[m[1].toLowerCase()];
          const year = parseInt(m[2], 10);
          if (monthIdx !== undefined && year > 2000) {
            const d = new Date(year, monthIdx, 1);
            const name = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
            return { periodDate: d, period: `${name} ${year}` };
          }
        }
      }
    }
  }
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    periodDate: d,
    period: d.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }),
  };
}

// Sections we look for (case-insensitive matching)
const SECTION_PATTERNS: Array<{ pattern: RegExp; sectionKey: string }> = [
  { pattern: /^\s*claims\s*$/i, sectionKey: 'claims' },
  { pattern: /^\s*upr\s*$/i, sectionKey: 'upr' },
  { pattern: /^\s*dac\s*$/i, sectionKey: 'dac' },
  { pattern: /^\s*sasria\s*$/i, sectionKey: 'sasria' },
  { pattern: /u\s*\/?\s*w\s+result/i, sectionKey: 'uw_result' },
  { pattern: /underwriting\s+result/i, sectionKey: 'uw_result' },
  { pattern: /^\s*vat\s*$/i, sectionKey: 'vat' },
];

// Level detection within a section
const LEVEL_PATTERNS: Array<{ pattern: RegExp; level: string }> = [
  { pattern: /quota\s+share/i, level: 'quota_share' },
  { pattern: /^\s*gross\s*$/i, level: 'gross' },
  { pattern: /^\s*net\s*$/i, level: 'net' },
];

// Metric name normalisation
function normaliseMetric(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s.includes('paid')) return 'paid';
  if (s.includes('os open') || s.includes('o/s open') || (s.includes('open') && s.includes('os'))) return 'os_open';
  if (s.includes('os close') || s.includes('o/s close') || (s.includes('close') && s.includes('os'))) return 'os_close';
  if (s.includes('os movement') || s.includes('o/s movement') || s.includes('os movement')) return 'os_movement';
  if (s.includes('incurred')) return 'incurred';
  if (s.includes('ibnr open') || (s.includes('ibnr') && s.includes('open'))) return 'ibnr_open';
  if (s.includes('ibnr close') || (s.includes('ibnr') && s.includes('close'))) return 'ibnr_close';
  if (s.includes('ibnr movement') || (s.includes('ibnr') && s.includes('move'))) return 'ibnr_movement';
  if (s.includes('ibnr')) return 'ibnr';
  if (s.includes('open') && !s.includes('close')) return 'open';
  if (s.includes('close') && !s.includes('open')) return 'close';
  if (s.includes('movement') || s.includes('move')) return 'movement';
  if (s.includes('premium')) return 'premium';
  if (s.includes('commission') || s.includes('comm')) return 'commission';
  if (s.includes('due from broker') || s.includes('from broker')) return 'due_from_broker';
  if (s.includes('due to sasria') || s.includes('to sasria')) return 'due_to_sasria';
  if (s.includes('result') || s.includes('u/w') || s.includes('uw')) return 'uw_result';
  return s.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

// Detect which columns are Gross, Quota Share, Net by scanning the header row of the section
function detectLevelColumns(sheet: XLSX.WorkSheet, headerRow: number, maxCol: number): Map<string, number> {
  const levelCols = new Map<string, number>();
  for (let c = 1; c <= maxCol; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
    if (!cell?.v) continue;
    const str = String(cell.v).trim();
    for (const { pattern, level } of LEVEL_PATTERNS) {
      if (pattern.test(str)) {
        if (!levelCols.has(level)) levelCols.set(level, c);
        break;
      }
    }
  }
  // If no explicit level columns found, assume columns 1,2,3 = gross, quota_share, net
  if (levelCols.size === 0) {
    levelCols.set('gross', 1);
    levelCols.set('quota_share', 2);
    levelCols.set('net', 3);
  }
  return levelCols;
}

export function parseMovementReport(buffer: ArrayBuffer): MovementParserResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const { periodDate, period } = detectPeriod(sheet);

  const ref = sheet['!ref'];
  if (!ref) return { rows: [], periodDate, period };

  const range = XLSX.utils.decode_range(ref);
  const rows: FinancialSummaryRow[] = [];

  let currentSection = '';
  let levelCols = new Map<string, number>();
  let inSectionData = false;

  for (let r = range.s.r; r <= range.e.r; r++) {
    // Check if this row is a section header
    const firstCell = sheet[XLSX.utils.encode_cell({ r, c: range.s.c })];
    const firstVal = firstCell?.v ? String(firstCell.v).trim() : '';

    let foundSection = false;
    for (const { pattern, sectionKey } of SECTION_PATTERNS) {
      if (pattern.test(firstVal)) {
        currentSection = sectionKey;
        inSectionData = false;
        // Next row may be the level header row
        // Look ahead 1 row for level headers
        levelCols = detectLevelColumns(sheet, r + 1, range.e.c);
        inSectionData = true;
        foundSection = true;
        break;
      }
    }
    if (foundSection) continue;
    if (!currentSection || !inSectionData) continue;

    // Check if this row has a metric label in col 0 and numeric values in level columns
    if (!firstVal) continue;

    // Skip if firstVal looks like a level header
    let isLevelHeader = false;
    for (const { pattern } of LEVEL_PATTERNS) {
      if (pattern.test(firstVal)) { isLevelHeader = true; break; }
    }
    if (isLevelHeader) continue;

    const metric = normaliseMetric(firstVal);
    if (!metric) continue;

    let hasAnyValue = false;
    for (const [level, col] of levelCols.entries()) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c: col })];
      if (cell?.v != null) {
        const val = toNum(cell.v);
        if (val !== 0 || String(cell.v).trim() !== '') {
          rows.push({ period, periodDate, section: currentSection, level, metric, value: val });
          hasAnyValue = true;
        }
      }
    }

    // If no level columns had values, end of section
    if (!hasAnyValue && r > range.s.r) {
      // Only stop the section if we've gone several rows without data
    }
  }

  return { rows, periodDate, period };
}
