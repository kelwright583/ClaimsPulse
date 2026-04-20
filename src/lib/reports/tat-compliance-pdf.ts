import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TatComplianceReportData } from './tat-compliance-data';

export function generateTatCompliancePdf(data: TatComplianceReportData): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });

  doc.setFillColor(13, 39, 97);
  doc.rect(0, 0, 210, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('TAT Compliance Report', 14, 13);
  doc.setFontSize(9);
  doc.text(`As of: ${data.snapshotDate}`, 150, 13);

  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: 28,
    head: [['Metric', 'Value']],
    body: [
      ['Overall Compliance', `${data.overallCompliance}%`],
      ['Total Open Claims', data.totalOpen],
      ['Total Breaches', data.totalBreaches],
    ],
    headStyles: { fillColor: [30, 91, 198] },
    styles: { fontSize: 10 },
  });

  const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setTextColor(13, 39, 97);
  doc.setFontSize(11);
  doc.text('By Secondary Status', 14, y1);
  autoTable(doc, {
    startY: y1 + 4,
    head: [['Status', 'Total', 'Breaches', 'Compliance']],
    body: data.bySecondaryStatus.map(s => [s.status, s.total, s.breaches, `${s.compliance}%`]),
    headStyles: { fillColor: [30, 91, 198] },
    styles: { fontSize: 8 },
  });

  // Page 2
  doc.addPage();
  doc.setTextColor(13, 39, 97);
  doc.setFontSize(12);
  doc.text('By Handler', 14, 20);
  autoTable(doc, {
    startY: 26,
    head: [['Handler', 'Total', 'Breaches', 'Compliance']],
    body: data.byHandler.map(h => [h.handler, h.total, h.breaches, `${h.compliance}%`]),
    headStyles: { fillColor: [30, 91, 198] },
    styles: { fontSize: 9 },
  });

  const y2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setTextColor(13, 39, 97);
  doc.setFontSize(12);
  doc.text('Current Breaches (Top 20)', 14, y2);
  autoTable(doc, {
    startY: y2 + 4,
    head: [['Claim ID', 'Handler', 'Status', 'Days']],
    body: data.breachList.map(b => [b.claimId, b.handler, b.secondaryStatus, b.daysInStatus]),
    headStyles: { fillColor: [245, 168, 0] },
    styles: { fontSize: 8 },
  });

  const pageH = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(`Generated ${new Date().toLocaleDateString('en-ZA')}. ClaimsPulse — Santam Emerging Business.`, 14, pageH - 8);

  return doc.output('arraybuffer') as unknown as Uint8Array;
}
