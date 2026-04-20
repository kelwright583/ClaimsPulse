import * as XLSX from 'xlsx';

export interface ClaimsRegisterRow {
  claimId: string;
  oldClaimId: string | null;
  handler: string | null;
  capturedBy: string | null;
  dateOfRegistration: Date | null;
  dateOfLoss: Date | null;
  claimStatus: string | null;
  secondaryStatus: string | null;
  cause: string | null;
  intimatedAmount: number | null;
  insured: string | null;
  broker: string | null;
  policyNumber: string | null;
  groupCode: string | null;
  groupDesc: string | null;
  productLine: string | null;
  orgUnit: string | null;
  grossIncurred: number | null;
  isCatastrophe: boolean;
}

export interface ClaimsRegisterParseResult {
  rows: ClaimsRegisterRow[];
  snapshotDate: Date;
  errors: string[];
}

function excelSerialToDate(serial: number): Date {
  return new Date((serial - 25569) * 86400 * 1000);
}

function parseDate(val: unknown): Date | null {
  if (val == null || val === '' || val === '-' || String(val).trim() === '-') return null;
  if (typeof val === 'number') return excelSerialToDate(val);
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parseDecimal(val: unknown): number | null {
  if (val == null || val === '' || val === '-' || String(val).trim() === '-') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function cleanStr(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  if (s === '' || s === '-' || s.toLowerCase() === 'not defined') return null;
  return s;
}

export function parseClaimsRegisterReport(buffer: ArrayBuffer): ClaimsRegisterParseResult {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames[0]; // Sheet "ZAR" or first sheet
  const ws = wb.Sheets[sheetName];

  // Header row is at row index 2 (0-based), data starts at row 3
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    range: 2, // skip rows 0 and 1, treat row 2 as headers
    defval: null,
  });

  const rows: ClaimsRegisterRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];

    const claimId = cleanStr(r['Claim'] ?? r['claim']);
    if (!claimId) {
      errors.push(`Row ${i + 4}: missing Claim ID — skipped`);
      continue;
    }

    const dateOfRegistration = parseDate(r['Date Captured'] ?? r['Date captured']);
    const dateOfLoss = parseDate(r['Date of Loss'] ?? r['Date Of Loss'] ?? r['date_of_loss']);

    if (!dateOfRegistration) {
      errors.push(`Row ${i + 4} (${claimId}): missing Date Captured — skipped`);
      continue;
    }

    // handler precedence: "Claim Handler" is current assignee, "Captured By" is who logged it
    const handler = cleanStr(r['Claim Handler'] ?? r['Claim handler']);
    const capturedBy = cleanStr(r['Captured By'] ?? r['Captured by']);

    rows.push({
      claimId,
      oldClaimId: cleanStr(r['Old Claim ID'] ?? r['Old Claim Id']),
      handler,
      capturedBy,
      dateOfRegistration,
      dateOfLoss,
      claimStatus: cleanStr(r['Claim Status'] ?? r['Claim status']),
      secondaryStatus: cleanStr(r['Secondary Status'] ?? r['Secondary status']),
      cause: cleanStr(r['Claim Cause'] ?? r['Claim cause']),
      intimatedAmount: parseDecimal(r['Intimated Amount'] ?? r['Intimated amount']),
      insured: cleanStr(r['Insured'] ?? r['insured']),
      broker: cleanStr(r['Broker'] ?? r['broker']),
      policyNumber: cleanStr(r['Policy'] ?? r['policy']),
      groupCode: cleanStr(r['Class'] ?? r['class']),
      groupDesc: cleanStr(r['Class Name'] ?? r['Class name']),
      productLine: cleanStr(r['ProductGroup'] ?? r['Product Group'] ?? r['productgroup']),
      orgUnit: cleanStr(r['Organisational Unit'] ?? r['Org Unit'] ?? r['OrgUnit']),
      grossIncurred: parseDecimal(r['Gross Incurred'] ?? r['Gross incurred']),
      isCatastrophe: !!(r['Catastrophe'] && String(r['Catastrophe']).trim() !== '' && String(r['Catastrophe']).trim() !== '0'),
    });
  }

  return {
    rows,
    snapshotDate: new Date(),
    errors,
  };
}
