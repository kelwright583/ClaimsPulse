import * as XLSX from 'xlsx';
import { parseAccountingNumber } from '@/lib/utils';

export interface MappedClaimsRow {
  claimId: string;
  oldClaimId?: string | null;
  handler?: string | null;
  claimStatus?: string | null;
  secondaryStatus?: string | null;
  orgUnit?: string | null;
  uwYear?: number | null;
  groupDesc?: string | null;
  sectionDesc?: string | null;
  policyNumber?: string | null;
  lossArea?: string | null;
  lossAddr?: string | null;
  insured?: string | null;
  broker?: string | null;
  dateOfLoss?: Date | null;
  cause?: string | null;
  deductible?: number | null;
  retainedPct?: number | null;
  intimatedAmount?: number | null;
  ownDamagePaid?: number | null;
  thirdPartyPaid?: number | null;
  expensesPaid?: number | null;
  legalCostsPaid?: number | null;
  assessorFeesPaid?: number | null;
  repairAuthPaid?: number | null;
  cashLieuPaid?: number | null;
  glassAuthPaid?: number | null;
  partsAuthPaid?: number | null;
  towingPaid?: number | null;
  additionalsPaid?: number | null;
  tpLiabilityPaid?: number | null;
  investigationPaid?: number | null;
  totalPaid?: number | null;
  totalRecovery?: number | null;
  totalSalvage?: number | null;
  ownDamageOs?: number | null;
  thirdPartyOs?: number | null;
  expensesOs?: number | null;
  legalCostsOs?: number | null;
  assessorFeesOs?: number | null;
  repairAuthOs?: number | null;
  cashLieuOs?: number | null;
  glassAuthOs?: number | null;
  tpLiabilityOs?: number | null;
  totalOs?: number | null;
  totalIncurred?: number | null;
  sectionSumInsured?: number | null;
}

export interface ClaimsParserResult {
  rows: MappedClaimsRow[];
  snapshotDate: Date;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return new Date(d.y, d.m - 1, d.d);
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function toNum(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  return parseAccountingNumber(String(value));
}

function extractSnapshotDate(sheet: XLSX.WorkSheet): Date {
  // Row 2 (zero-index 1) contains "As at DD Month YYYY" or similar
  // Scan cells in row 1 for a date pattern
  const ref = sheet['!ref'];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r: 1, c });
      const cell = sheet[cellAddr];
      if (cell && cell.v) {
        const str = String(cell.v);
        // Match "As at 31 March 2025" or "31 March 2025" or "31/03/2025"
        const monthNames: Record<string, number> = {
          january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
          july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
          jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
          sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
        };
        // Try "DD Month YYYY"
        const longMatch = str.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
        if (longMatch) {
          const day = parseInt(longMatch[1], 10);
          const monthIdx = monthNames[longMatch[2].toLowerCase()];
          const year = parseInt(longMatch[3], 10);
          if (monthIdx !== undefined && !isNaN(day) && !isNaN(year)) {
            return new Date(year, monthIdx, day);
          }
        }
        // Try "DD/MM/YYYY"
        const slashMatch = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (slashMatch) {
          const day = parseInt(slashMatch[1], 10);
          const month = parseInt(slashMatch[2], 10) - 1;
          const year = parseInt(slashMatch[3], 10);
          return new Date(year, month, day);
        }
      }
    }
  }
  // Default to today if no date found
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function parseClaimsReport(buffer: ArrayBuffer): ClaimsParserResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // Extract snapshot date from row 2 BEFORE modifying the range
  const snapshotDate = extractSnapshotDate(sheet);

  // Override range to start from row 3 (zero-indexed row 2) so row 3 becomes headers
  const range = XLSX.utils.decode_range(sheet['!ref']!);
  range.s.r = 2;
  sheet['!ref'] = XLSX.utils.encode_range(range);

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });

  const rows: MappedClaimsRow[] = rawRows
    .filter(r => r['Claim'] != null && String(r['Claim']).trim() !== '')
    .map((r): MappedClaimsRow | null => {
      const claimId = String(r['Claim'] ?? '').trim();
      if (!claimId) return null;

      return {
        claimId,
        oldClaimId: r['Old Claim Number'] ? String(r['Old Claim Number']).trim() : null,
        handler: r['Claim Handler'] ? String(r['Claim Handler']).trim() : null,
        claimStatus: r['Claim Status'] ? String(r['Claim Status']).trim() : null,
        secondaryStatus: r['Secondary Claim Status'] ? String(r['Secondary Claim Status']).trim() : null,
        orgUnit: r['Organisational Unit'] ? String(r['Organisational Unit']).trim() : null,
        uwYear: r['Underwriting Year'] ? parseInt(String(r['Underwriting Year']), 10) || null : null,
        groupDesc: r['Group Description'] ? String(r['Group Description']).trim() : null,
        sectionDesc: r['Section Description'] ? String(r['Section Description']).trim() : null,
        policyNumber: r['Policy'] ? String(r['Policy']).trim() : null,
        lossArea: r['Area of Target (Capacity Purposes)'] ? String(r['Area of Target (Capacity Purposes)']).trim() : null,
        lossAddr: r['Loss Address'] ? String(r['Loss Address']).trim() : null,
        insured: r['Insured'] ? String(r['Insured']).trim() : null,
        broker: r['Broker'] ? String(r['Broker']).trim() : null,
        dateOfLoss: parseDate(r['DOL']),
        cause: r['Cause'] ? String(r['Cause']).trim() : null,
        deductible: toNum(r['100% Deductible']),
        retainedPct: toNum(r['Retained %']),
        intimatedAmount: toNum(r['Intimated Amount']),
        ownDamagePaid: toNum(r['Own Damage Paid']),
        thirdPartyPaid: toNum(r['Third Party Paid']),
        expensesPaid: toNum(r['Expenses Paid']),
        legalCostsPaid: toNum(r['Legal Costs Paid']),
        assessorFeesPaid: toNum(r["Assessor's Fees Paid"]),
        repairAuthPaid: toNum(r['Repair Authorisation Paid']),
        cashLieuPaid: toNum(r['Cash In Lieu of Repairs Paid']),
        glassAuthPaid: toNum(r['Glass Authorisation Paid']),
        partsAuthPaid: toNum(r['Parts Authorisation Paid']),
        towingPaid: toNum(r['Towing, Storage, Release Fees Paid']),
        additionalsPaid: toNum(r['Additionals Paid']),
        tpLiabilityPaid: toNum(r['Third Party Liability Paid']),
        investigationPaid: toNum(r['Investigation Paid']),
        totalPaid: toNum(r['Total Paid']),
        totalRecovery: toNum(r['Total Recovery']),
        totalSalvage: toNum(r['Total Salvage']),
        ownDamageOs: toNum(r['Own Damage Outstanding']),
        thirdPartyOs: toNum(r['Third Party Outstanding']),
        expensesOs: toNum(r['Expenses Outstanding']),
        legalCostsOs: toNum(r['Legal Costs Outstanding']),
        assessorFeesOs: toNum(r["Assessor's Fees Outstanding"]),
        repairAuthOs: toNum(r['Repair Authorisation Outstanding']),
        cashLieuOs: toNum(r['Cash In Lieu of Repairs Outstanding']),
        glassAuthOs: toNum(r['Glass Authorisation Outstanding']),
        tpLiabilityOs: toNum(r['Third Party Liability Outstanding']),
        totalOs: toNum(r['Total Outstanding']),
        totalIncurred: toNum(r['Total Incurred']),
        sectionSumInsured: toNum(r['Section Sum Insured']),
      };
    })
    .filter((r): r is MappedClaimsRow => r !== null);

  return { rows, snapshotDate };
}
