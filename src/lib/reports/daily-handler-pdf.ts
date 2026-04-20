import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface DailyHandlerReportData {
  handler: string;
  snapshotDate: string;
  role: string;
  overallScore: number;
  status: 'on_track' | 'at_risk' | 'off_track';
  metrics: Array<{ label: string; actual: number; target: number; unit: string; trend: 'up' | 'down' | 'flat' }>;
  portfolio: { open: number; finalised: number; avgOs: number; complexityWeight: number };
  focusAreas: Array<{ claimId: string; reason: string; daysInStatus: number; totalOs: number }>;
  flags: Array<{ claimId: string; flagType: string; severity: string }>;
  wins: Array<{ label: string; note: string }>;
}

export function generateDailyHandlerPdf(data: DailyHandlerReportData): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });

  // Header band
  doc.setFillColor(13, 39, 97);
  doc.rect(0, 0, 210, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('Daily Handler Report', 14, 13);
  doc.setFontSize(9);
  doc.text(`Snapshot: ${data.snapshotDate}`, 150, 13);

  // Handler name + score
  doc.setTextColor(13, 39, 97);
  doc.setFontSize(16);
  doc.text(data.handler, 14, 32);
  doc.setFontSize(12);
  const statusColor: [number, number, number] =
    data.status === 'on_track' ? [22, 163, 74] :
    data.status === 'at_risk' ? [234, 179, 8] :
    [220, 38, 38];
  doc.setTextColor(...statusColor);
  doc.text(`Score: ${data.overallScore}%  (${data.status.replace('_', ' ')})`, 14, 42);

  // Metrics table
  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: 50,
    head: [['Metric', 'Actual', 'Target', 'Unit', 'Trend']],
    body: data.metrics.map(m => [m.label, String(m.actual), String(m.target), m.unit, m.trend]),
    headStyles: { fillColor: [30, 91, 198] },
    styles: { fontSize: 9 },
  });

  // Portfolio
  const afterMetrics = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: afterMetrics,
    head: [['Open Claims', 'Finalised', 'Avg O/S (R)', 'Complexity WIP']],
    body: [[data.portfolio.open, data.portfolio.finalised, `R${data.portfolio.avgOs.toFixed(0)}`, data.portfolio.complexityWeight]],
    headStyles: { fillColor: [30, 91, 198] },
    styles: { fontSize: 9 },
  });

  // Focus areas
  if (data.focusAreas.length > 0) {
    const afterPortfolio = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    doc.setFontSize(11);
    doc.setTextColor(13, 39, 97);
    doc.text('Focus Areas', 14, afterPortfolio);
    autoTable(doc, {
      startY: afterPortfolio + 4,
      head: [['Claim ID', 'Reason', 'Days in Status', 'Total O/S']],
      body: data.focusAreas.map(f => [f.claimId, f.reason, f.daysInStatus, `R${f.totalOs.toFixed(0)}`]),
      headStyles: { fillColor: [245, 168, 0] },
      styles: { fontSize: 8 },
    });
  }

  // Footer
  const pageH = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(`Generated ${new Date().toLocaleDateString('en-ZA')}. ClaimsPulse — Santam Emerging Business.`, 14, pageH - 8);

  return doc.output('arraybuffer') as unknown as Uint8Array;
}
