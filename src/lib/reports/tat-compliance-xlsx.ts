import * as XLSX from 'xlsx';
import type { TatComplianceReportData } from './tat-compliance-data';

export function generateTatComplianceXlsx(data: TatComplianceReportData): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
    overallCompliance: data.overallCompliance,
    totalOpen: data.totalOpen,
    totalBreaches: data.totalBreaches,
    snapshotDate: data.snapshotDate,
  }]), 'Overall');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.byHandler), 'ByHandler');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.breachList), 'Breaches');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
}
