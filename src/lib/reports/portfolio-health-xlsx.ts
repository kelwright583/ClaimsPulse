import * as XLSX from 'xlsx';
import type { PortfolioHealthReportData } from './portfolio-health-data';

export function generatePortfolioHealthXlsx(data: PortfolioHealthReportData): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.byStatus), 'Status');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.byAgeBucket), 'Age');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.byCause), 'Cause');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.byProduct), 'Product');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
}
