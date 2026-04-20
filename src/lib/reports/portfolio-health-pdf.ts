import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PortfolioHealthReportData } from './portfolio-health-data';

export function generatePortfolioHealthPdf(data: PortfolioHealthReportData): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });

  doc.setFillColor(13, 39, 97);
  doc.rect(0, 0, 210, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('Portfolio Health Report', 14, 13);
  doc.setFontSize(9);
  doc.text(`As of: ${data.snapshotDate}`, 150, 13);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`Total Open: ${data.totalOpen}   Total O/S: R${data.totalOs.toFixed(0)}`, 14, 28);

  autoTable(doc, {
    startY: 34,
    head: [['Status', 'Count', 'Total O/S (R)']],
    body: data.byStatus.map(s => [s.status, s.count, `R${s.totalOs.toFixed(0)}`]),
    headStyles: { fillColor: [30, 91, 198] },
    styles: { fontSize: 8 },
  });

  const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setTextColor(13, 39, 97);
  doc.setFontSize(11);
  doc.text('Age Buckets', 14, y1);
  autoTable(doc, {
    startY: y1 + 4,
    head: [['Bucket', 'Count']],
    body: data.byAgeBucket.map(b => [b.bucket, b.count]),
    headStyles: { fillColor: [30, 91, 198] },
    styles: { fontSize: 9 },
  });

  // Page 2
  doc.addPage();
  doc.setTextColor(13, 39, 97);
  doc.setFontSize(12);
  doc.text('By Cause (Top 10)', 14, 20);
  autoTable(doc, {
    startY: 26,
    head: [['Cause', 'Count', 'Total O/S (R)']],
    body: data.byCause.map(c => [c.cause, c.count, `R${c.totalOs.toFixed(0)}`]),
    headStyles: { fillColor: [30, 91, 198] },
    styles: { fontSize: 9 },
  });

  const y2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setTextColor(13, 39, 97);
  doc.setFontSize(12);
  doc.text('By Product Line', 14, y2);
  autoTable(doc, {
    startY: y2 + 4,
    head: [['Product Line', 'Count', 'Total O/S (R)']],
    body: data.byProduct.map(p => [p.productLine, p.count, `R${p.totalOs.toFixed(0)}`]),
    headStyles: { fillColor: [30, 91, 198] },
    styles: { fontSize: 9 },
  });

  const pageH = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(`Generated ${new Date().toLocaleDateString('en-ZA')}. ClaimsPulse — Santam Emerging Business.`, 14, pageH - 8);

  return doc.output('arraybuffer') as unknown as Uint8Array;
}
