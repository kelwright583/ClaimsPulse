import * as XLSX from 'xlsx';
import { parseAccountingNumber } from '@/lib/utils';
import { differenceInDays } from 'date-fns';
import { findHeaderRow } from './utils';

export interface MappedPayeeRow {
  claimId: string;
  handler?: string | null;
  chequeNo?: string | null;
  payee?: string | null;
  payeeVatNr?: string | null;
  paymentType?: string | null;
  requestedBy?: string | null;
  requestedDate?: Date | null;
  authorisedDate?: Date | null;
  printedDate?: Date | null;
  grossPaidInclVat?: number | null;
  grossPaidExclVat?: number | null;
  netPaidInclVat?: number | null;
  broker?: string | null;
  policyNumber?: string | null;
  insured?: string | null;
  claimStatus?: string | null;
  dateOfLoss?: Date | null;
  dateOfNotification?: Date | null;
  dateOfRegistration?: Date | null;
  // Computed integrity fields
  sameDayAuthPrint: boolean;
  selfAuthorised: boolean;
  daysRequestToprint?: number | null;
}

export interface PayeeParserResult {
  rows: MappedPayeeRow[];
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

function getCell(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null) return row[key];
  }
  return null;
}

export function parsePayeeReport(buffer: ArrayBuffer): PayeeParserResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const headerRow = findHeaderRow(sheet, [
    'Claim Number', 'Claims Handler', 'Payee', 'Cheque Requested', 'Estimate Type',
  ]);

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
    range: headerRow,
  });

  const rows: MappedPayeeRow[] = rawRows
    .filter(r => {
      const claimId = getCell(r, 'Claim Number', 'Claim');
      return claimId != null && String(claimId).trim() !== '';
    })
    .map(r => {
      const claimId = String(getCell(r, 'Claim Number', 'Claim') ?? '').trim();
      const handler = getCell(r, 'Claims Handler', 'Claim Handler') ? String(getCell(r, 'Claims Handler', 'Claim Handler')).trim() : null;
      const requestedBy = getCell(r, 'Payment(s) Requested By', 'Requested By') ? String(getCell(r, 'Payment(s) Requested By', 'Requested By')).trim() : null;

      const requestedDate = parseDate(getCell(r, 'Cheque Requested', 'Date Requested'));
      const authorisedDate = parseDate(getCell(r, 'Cheque Authorised', 'Date Authorised'));
      const printedDate = parseDate(getCell(r, 'Cheque Printed', 'Date Printed'));

      // Compute integrity fields
      const sameDayAuthPrint =
        authorisedDate != null &&
        printedDate != null &&
        authorisedDate.toDateString() === printedDate.toDateString();

      const selfAuthorised =
        requestedBy != null &&
        handler != null &&
        requestedBy.toLowerCase() === handler.toLowerCase();

      let daysRequestToprint: number | null = null;
      if (requestedDate && printedDate) {
        daysRequestToprint = differenceInDays(printedDate, requestedDate);
      }

      return {
        claimId,
        handler,
        dateOfLoss: parseDate(getCell(r, 'Date Of Loss')),
        dateOfNotification: parseDate(getCell(r, 'Date Of Notification')),
        dateOfRegistration: parseDate(getCell(r, 'Date Of Registration')),
        chequeNo: getCell(r, 'Cheque No') ? String(getCell(r, 'Cheque No')).trim() : null,
        payee: getCell(r, 'Payee', 'Payee Name') ? String(getCell(r, 'Payee', 'Payee Name')).trim() : null,
        payeeVatNr: getCell(r, 'Payee VAT Nr', 'Payee VAT Number') ? String(getCell(r, 'Payee VAT Nr', 'Payee VAT Number')).trim() : null,
        paymentType: getCell(r, 'Estimate Type', 'Payment Type') ? String(getCell(r, 'Estimate Type', 'Payment Type')).trim() : null,
        requestedBy,
        requestedDate,
        authorisedDate,
        printedDate,
        grossPaidInclVat: toNum(getCell(r, 'Gross Paid Incl VAT')),
        grossPaidExclVat: toNum(getCell(r, 'Gross Paid Excl VAT')),
        netPaidInclVat: toNum(getCell(r, 'Net Paid Incl VAT')),
        broker: getCell(r, 'Broker') ? String(getCell(r, 'Broker')).trim() : null,
        policyNumber: getCell(r, 'Policy Number') ? String(getCell(r, 'Policy Number')).trim() : null,
        insured: getCell(r, 'Insured') ? String(getCell(r, 'Insured')).trim() : null,
        claimStatus: getCell(r, 'Claim Status') ? String(getCell(r, 'Claim Status')).trim() : null,
        sameDayAuthPrint,
        selfAuthorised,
        daysRequestToprint,
      } satisfies MappedPayeeRow;
    });

  return { rows };
}
