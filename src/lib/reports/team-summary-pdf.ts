import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TeamSummaryReportData } from './team-summary-data';

export function generateTeamSummaryPdf(data: TeamSummaryReportData): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });

  doc.setFillColor(13, 39, 97);
  doc.rect(0, 0, 210, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('Team Summary Report', 14, 13);
  doc.setFontSize(9);
  doc.text(`As of: ${data.snapshotDate}`, 150, 13);

  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: 28,
    head: [['Metric', 'Value']],
    body: [
      ['Total Open Claims', data.kpis.totalOpen],
      ['Total Finalised', data.kpis.totalFinalised],
      ['Avg TAT Compliance', `${data.kpis.avgTatCompliance}%`],
    ],
    headStyles: { fillColor: [30, 91, 198] },
    styles: { fontSize: 10 },
  });

  const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  autoTable(doc, {
    startY: y1,
    head: [['Handler', 'Open', 'Finalised', 'TAT Compliance']],
    body: data.handlers.map(h => [h.handler, h.open, h.finalised, `${h.tatCompliance}%`]),
    headStyles: { fillColor: [30, 91, 198] },
    styles: { fontSize: 9 },
  });

  // Page 2
  doc.addPage();
  doc.setTextColor(13, 39, 97);
  doc.setFontSize(12);
  doc.text('Top Brokers by Claims', 14, 20);
  autoTable(doc, {
    startY: 26,
    head: [['Broker', 'Claims']],
    body: data.topBrokers.map(b => [b.broker, b.claimCount]),
    headStyles: { fillColor: [30, 91, 198] },
    styles: { fontSize: 9 },
  });

  const y2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setTextColor(13, 39, 97);
  doc.setFontSize(12);
  doc.text('Integrity Flag Summary', 14, y2);
  autoTable(doc, {
    startY: y2 + 6,
    head: [['Flag Type', 'Count']],
    body: data.flagSummary.map(f => [f.flagType, f.count]),
    headStyles: { fillColor: [245, 168, 0] },
    styles: { fontSize: 9 },
  });

  const pageH = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(`Generated ${new Date().toLocaleDateString('en-ZA')}. ClaimsPulse — Santam Emerging Business.`, 14, pageH - 8);

  return doc.output('arraybuffer') as unknown as Uint8Array;
}
