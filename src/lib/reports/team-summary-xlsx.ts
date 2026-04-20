import * as XLSX from 'xlsx';
import type { TeamSummaryReportData } from './team-summary-data';

export function generateTeamSummaryXlsx(data: TeamSummaryReportData): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([data.kpis]), 'KPIs');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.handlers), 'Handlers');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.topBrokers), 'Brokers');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.flagSummary), 'Flags');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
}
