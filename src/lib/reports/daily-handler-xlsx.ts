import * as XLSX from 'xlsx';
import type { DailyHandlerReportData } from './daily-handler-pdf';

export function generateDailyHandlerXlsx(data: DailyHandlerReportData): Uint8Array {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Daily Handler Report'],
    ['Handler', data.handler],
    ['Snapshot Date', data.snapshotDate],
    ['Overall Score', `${data.overallScore}%`],
    ['Status', data.status],
  ]), 'Summary');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.metrics), 'Metrics');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([data.portfolio]), 'Portfolio');

  if (data.focusAreas.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.focusAreas), 'Focus Areas');
  }
  if (data.flags.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.flags), 'Flags');
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf as Uint8Array;
}
