import * as XLSX from 'xlsx';

/**
 * Scan the first `maxScan` rows of a worksheet to find the header row.
 *
 * Looks for the first row where at least `minMatches` of the given `markers`
 * appear as cell values. Handles files with 0–N title/metadata rows before
 * the actual column headers.
 *
 * @param sheet      — XLSX WorkSheet
 * @param markers    — column names to look for
 * @param maxScan    — how many rows to check (default 10)
 * @param minMatches — how many markers must match (default 3)
 * @returns 0-based row index of the header row
 */
export function findHeaderRow(
  sheet: XLSX.WorkSheet,
  markers: string[],
  maxScan = 10,
  minMatches = 3,
): number {
  const ref = sheet['!ref'];
  if (!ref) return 0;

  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + maxScan - 1); r++) {
    const cellValues: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (cell && cell.v != null) {
        cellValues.push(String(cell.v).trim());
      }
    }
    const matchCount = markers.filter(m => cellValues.includes(m)).length;
    if (matchCount >= minMatches) return r;
  }

  // Fallback: no header row found, assume row 0
  return 0;
}
