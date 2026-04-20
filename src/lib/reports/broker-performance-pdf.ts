import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BrokerPerformanceReportData } from './broker-performance-data';

export function generateBrokerPerformancePdf(data: BrokerPerformanceReportData): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });

  doc.setFillColor(13, 39, 97);
  doc.rect(0, 0, 210, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('Broker Performance Report', 14, 13);
  doc.setFontSize(9);
  doc.text(`As of: ${data.snapshotDate}`, 150, 13);

  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: 28,
    head: [['Broker', 'Claims', 'Avg Claim Size (R)', 'TAT Compliance', 'Big Claims', 'Total O/S (R)']],
    body: data.brokers.slice(0, 30).map(b => [
      b.broker,
      b.claimCount,
      `R${b.avgClaimSize.toFixed(0)}`,
      `${b.tatCompliance}%`,
      b.bigClaimsCount,
      `R${b.totalOs.toFixed(0)}`,
    ]),
    headStyles: { fillColor: [30, 91, 198] },
    styles: { fontSize: 8 },
  });

  const pageH = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(`Generated ${new Date().toLocaleDateString('en-ZA')}. ClaimsPulse — Santam Emerging Business.`, 14, pageH - 8);

  return doc.output('arraybuffer') as unknown as Uint8Array;
}
