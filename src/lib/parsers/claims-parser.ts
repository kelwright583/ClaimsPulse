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
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return new Date(d.y, d.m - 1, d.d);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // DD/MM/YYYY — South African format
    const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function toNum(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  return parseAccountingNumber(String(value));
}

function extractSnapshotDate(): Date {
  // xlsx format has no embedded date — use today (the upload date is the snapshot date)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function parseClaimsReport(buffer: ArrayBuffer): ClaimsParserResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const snapshotDate = extractSnapshotDate();

  // Row 0 = headers, Row 1+ = data. No title rows in the xlsx format.
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });

  const rows: MappedClaimsRow[] = rawRows
    .filter(r => {
      const val = r['Claim'];
      if (val == null || String(val).trim() === '') return false;
      const str = String(val).trim();
      // Skip sequence number artefacts — real claim IDs contain a slash (e.g. "823248/1")
      // or are long numeric strings. Plain integers ≤ 4 chars are artefacts.
      if (/^\d{1,4}$/.test(str)) return false;
      return true;
    })
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
