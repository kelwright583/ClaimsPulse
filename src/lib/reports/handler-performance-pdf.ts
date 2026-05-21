import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HandlerPerformancePDFData {
  handler: string;
  firstName: string;
  reportDate: string;
  compareFrom: string | null;
  compareTo: string;

  metrics: {
    criticalCurrent: number;
    criticalPrevious: number | null;
    urgentCurrent: number;
    urgentPrevious: number | null;
    standardCurrent: number;
    standardPrevious: number | null;
    tatBreachesCurrent: number;
    tatBreachesPrevious: number | null;
    totalOsCurrent: number;
    totalOsPrevious: number | null;
    finalisedCurrent: number;
    finalisedPrevious: number | null;
  };

  wins: { finalisedCount: number; improvedCount: number; movedOutOfCritical: number };

  resolvedClaims: Array<{
    claimId: string;
    previousStatus: string;
    currentStatus: string | null;
    outstanding: number;
  }>;

  stuckClaims: Array<{
    claimId: string;
    secondaryStatus: string;
    daysInStatus: number;
    outstanding: number;
  }>;

  criticalItems: Array<{ claimId: string; secondaryStatus: string; daysInStatus: number; outstanding: number; tatStatus: 'BREACH' | 'AT RISK' | 'ON TRACK' }>;
  urgentItems: Array<{ claimId: string; secondaryStatus: string; daysInStatus: number; outstanding: number; tatStatus: 'BREACH' | 'AT RISK' | 'ON TRACK' }>;
  standardItems: Array<{ claimId: string; secondaryStatus: string; daysInStatus: number; outstanding: number; tatStatus: 'BREACH' | 'AT RISK' | 'ON TRACK' }>;

  portfolio: { critical: number; urgent: number; standard: number; finalised: number; totalOpen: number };
  registeredInPeriod: number;
  finalisedInPeriod: number;
}

// ── Colours ───────────────────────────────────────────────────────────────────

const C = {
  navy: [13, 39, 97] as [number, number, number],
  blue: [30, 91, 198] as [number, number, number],
  gold: [245, 168, 0] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  lightGray: [244, 246, 250] as [number, number, number],
  gray: [107, 114, 128] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  darkRed: [153, 27, 27] as [number, number, number],
  lightRed: [254, 226, 226] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  darkGreen: [22, 101, 52] as [number, number, number],
  lightGreen: [220, 252, 231] as [number, number, number],
  amber: [245, 158, 11] as [number, number, number],
  lightAmber: [255, 251, 235] as [number, number, number],
  lightBlue: [239, 246, 255] as [number, number, number],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function rgb(doc: jsPDF, color: [number, number, number], fill = true) {
  if (fill) doc.setFillColor(color[0], color[1], color[2]);
  else doc.setTextColor(color[0], color[1], color[2]);
  return doc;
}

function textC(doc: jsPDF, color: [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtRand(v: number): string {
  if (v >= 1_000_000) return `R${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R${(v / 1_000).toFixed(0)}K`;
  return `R${v.toLocaleString('en-ZA')}`;
}

function deltaArrow(curr: number, prev: number | null, lowerIsBetter: boolean): { arrow: string; color: [number, number, number] } {
  if (prev === null) return { arrow: '', color: C.gray };
  const delta = curr - prev;
  if (delta === 0) return { arrow: '→', color: C.gray };
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return improved
    ? { arrow: delta < 0 ? '↓' : '↑', color: C.green }
    : { arrow: delta < 0 ? '↓' : '↑', color: C.red };
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawFooter(doc: jsPDF, handler: string, pageNum: number, totalPages: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const y = pageH - 12;

  // Gold rule
  doc.setDrawColor(C.gold[0], C.gold[1], C.gold[2]);
  doc.setLineWidth(0.5);
  doc.line(14, y - 4, pageW - 14, y - 4);

  doc.setFontSize(7);
  textC(doc, C.gray);
  doc.text('Santam Emerging Business — Claims Management', 14, y);
  doc.text(`Generated ${fmtDate(new Date().toISOString().split('T')[0])} | Page ${pageNum} of ${totalPages}`, pageW / 2, y, { align: 'center' });
  doc.text(`This report is confidential and intended for ${handler} only.`, pageW - 14, y, { align: 'right' });
}

function drawHeader(doc: jsPDF, reportDate: string, compareFrom: string | null) {
  const pageW = doc.internal.pageSize.getWidth();

  // Navy header band
  rgb(doc, C.navy);
  doc.rect(0, 0, pageW, 22, 'F');

  // Brand text left
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  textC(doc, C.gold);
  doc.text('SANTAM EMERGING BUSINESS', 14, 8);

  doc.setFontSize(10);
  textC(doc, C.white);
  doc.text('Claims Performance Report', 14, 15);

  // Date right
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  textC(doc, [200, 210, 230]);
  const dateText = compareFrom
    ? `${fmtDate(reportDate)} | Comparing: ${fmtDate(compareFrom)}`
    : fmtDate(reportDate);
  doc.text(dateText, pageW - 14, 12, { align: 'right' });

  // Gold rule bottom of header
  doc.setDrawColor(C.gold[0], C.gold[1], C.gold[2]);
  doc.setLineWidth(0.8);
  doc.line(0, 22, pageW, 22);
}

function drawDoughnut(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  innerR: number,
  segments: Array<{ value: number; color: [number, number, number]; label: string }>,
) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return;

  let startAngle = -Math.PI / 2;
  const step = 0.02;

  for (const seg of segments) {
    if (seg.value === 0) continue;
    const angle = (seg.value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;

    // Draw filled arc as polygon approximation
    const pts: Array<[number, number]> = [];
    for (let a = startAngle; a <= endAngle; a += step) {
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    pts.push([cx + r * Math.cos(endAngle), cy + r * Math.sin(endAngle)]);
    // Inner arc reversed
    for (let a = endAngle; a >= startAngle; a -= step) {
      pts.push([cx + innerR * Math.cos(a), cy + innerR * Math.sin(a)]);
    }

    doc.setFillColor(seg.color[0], seg.color[1], seg.color[2]);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.3);

    if (pts.length < 2) continue;
    // Build path
    doc.lines(
      pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]] as [number, number]),
      pts[0][0],
      pts[0][1],
      [1, 1],
      'FD',
      true,
    );

    startAngle = endAngle;
  }
}

function drawBarChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  groups: Array<{ label: string; bars: Array<{ value: number; color: [number, number, number]; label: string }> }>,
) {
  const maxVal = Math.max(...groups.flatMap(g => g.bars.map(b => b.value)), 1);
  const groupW = w / groups.length;
  const barW = (groupW - 8) / (groups[0]?.bars.length ?? 1);

  // Draw axes
  doc.setDrawColor(C.lightGray[0], C.lightGray[1], C.lightGray[2]);
  doc.setLineWidth(0.3);
  doc.line(x, y, x, y + h);
  doc.line(x, y + h, x + w, y + h);

  // Y-axis labels
  doc.setFontSize(6);
  textC(doc, C.gray);
  for (let i = 0; i <= 4; i++) {
    const val = Math.round((maxVal * i) / 4);
    const yPos = y + h - (i / 4) * h;
    doc.text(String(val), x - 2, yPos + 1, { align: 'right' });
    doc.setDrawColor(C.lightGray[0], C.lightGray[1], C.lightGray[2]);
    doc.line(x, yPos, x + w, yPos);
  }

  groups.forEach((group, gi) => {
    const gx = x + gi * groupW + 4;
    group.bars.forEach((bar, bi) => {
      const bx = gx + bi * (barW + 1);
      const barH = (bar.value / maxVal) * h;
      const by = y + h - barH;
      doc.setFillColor(bar.color[0], bar.color[1], bar.color[2]);
      doc.rect(bx, by, barW, barH, 'F');
    });
    // Group label
    doc.setFontSize(6);
    textC(doc, C.gray);
    doc.text(group.label, gx + (groupW - 8) / 2, y + h + 5, { align: 'center', maxWidth: groupW });
  });
}

// ── Page 1 ────────────────────────────────────────────────────────────────────

function buildPage1(doc: jsPDF, d: HandlerPerformancePDFData) {
  const pageW = doc.internal.pageSize.getWidth();
  let y = 28;

  // Greeting
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  textC(doc, C.navy);
  doc.text(`Good morning, ${d.firstName}.`, 14, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  textC(doc, C.gray);
  const subtitle = d.compareFrom
    ? `Here is your performance snapshot for ${fmtDate(d.compareTo)}. This report compares your portfolio against ${fmtDate(d.compareFrom)}.`
    : `Here is your performance snapshot for ${fmtDate(d.compareTo)}.`;
  const subtitleLines = doc.splitTextToSize(subtitle, pageW - 28);
  doc.text(subtitleLines, 14, y);
  y += subtitleLines.length * 5 + 6;

  // ── Wins section ─────────────────────────────────────────────────────────────
  // Section label
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  textC(doc, C.gold);
  doc.text('✓  WHAT YOU MOVED', 17, y);
  // Green left border bar
  doc.setFillColor(C.green[0], C.green[1], C.green[2]);
  doc.rect(14, y - 5, 2, 4, 'F');
  y += 3;

  // Green box
  const winsBoxH = d.resolvedClaims.length > 0 ? 30 + d.resolvedClaims.slice(0, 5).length * 5 : 20;
  doc.setFillColor(C.lightGreen[0], C.lightGreen[1], C.lightGreen[2]);
  doc.setDrawColor(C.green[0], C.green[1], C.green[2]);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, y, pageW - 28, winsBoxH, 2, 2, 'FD');
  // Left border accent
  doc.setFillColor(C.green[0], C.green[1], C.green[2]);
  doc.rect(14, y, 3, winsBoxH, 'F');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  textC(doc, C.darkGreen);
  const winsLines: string[] = [];
  if (d.wins.finalisedCount > 0) winsLines.push(`You finalised ${d.wins.finalisedCount} claim${d.wins.finalisedCount !== 1 ? 's' : ''} this period.`);
  if (d.wins.movedOutOfCritical > 0) winsLines.push(`You moved ${d.wins.movedOutOfCritical} claim${d.wins.movedOutOfCritical !== 1 ? 's' : ''} out of critical status.`);
  if (d.wins.improvedCount > 0) winsLines.push(`${d.wins.improvedCount} claim${d.wins.improvedCount !== 1 ? 's' : ''} improved priority level.`);
  if (winsLines.length === 0) winsLines.push('No finalisations this period — focus on the priority list below.');
  doc.text(winsLines.join('  ·  '), 20, y + 7, { maxWidth: pageW - 36 });

  if (d.resolvedClaims.length > 0) {
    const tableY = y + 13;
    autoTable(doc, {
      startY: tableY,
      margin: { left: 20, right: 14 },
      head: [['Claim ID', 'Was', 'Now', 'Outstanding']],
      body: d.resolvedClaims.slice(0, 5).map(c => [
        (c.currentStatus === null ? '✓ ' : '') + c.claimId,
        c.previousStatus,
        c.currentStatus ?? 'Resolved',
        fmtRand(c.outstanding),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: C.green, textColor: C.white, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [240, 255, 244] },
      theme: 'plain',
    });
  }

  y += winsBoxH + 6;

  // ── Six delta metric cards ────────────────────────────────────────────────────
  const metricsData = [
    { label: 'Critical Claims', curr: d.metrics.criticalCurrent, prev: d.metrics.criticalPrevious, lowerBetter: true },
    { label: 'Urgent Claims', curr: d.metrics.urgentCurrent, prev: d.metrics.urgentPrevious, lowerBetter: true },
    { label: 'Standard Claims', curr: d.metrics.standardCurrent, prev: d.metrics.standardPrevious, lowerBetter: false },
    { label: 'TAT Breaches', curr: d.metrics.tatBreachesCurrent, prev: d.metrics.tatBreachesPrevious, lowerBetter: true },
    { label: 'Total Outstanding', curr: d.metrics.totalOsCurrent, prev: d.metrics.totalOsPrevious, lowerBetter: true },
    { label: 'Claims Finalised', curr: d.metrics.finalisedCurrent, prev: d.metrics.finalisedPrevious, lowerBetter: false },
  ];

  const cardW = (pageW - 28 - 10) / 3;
  const cardH = 26;
  const colGap = 5;

  metricsData.forEach((m, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const cx = 14 + col * (cardW + colGap);
    const cy = y + row * (cardH + 4);

    // Card border
    doc.setFillColor(248, 250, 255);
    doc.setDrawColor(C.blue[0], C.blue[1], C.blue[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'FD');

    // Label
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    textC(doc, C.gray);
    doc.text(m.label.toUpperCase(), cx + 4, cy + 7);

    // Current value
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    textC(doc, C.navy);
    const valStr = m.label === 'Total Outstanding' ? fmtRand(m.curr) : String(m.curr);
    doc.text(valStr, cx + 4, cy + 18);

    // Delta row
    if (m.prev !== null) {
      const { arrow, color } = deltaArrow(m.curr, m.prev, m.lowerBetter);
      const delta = Math.abs(m.curr - m.prev);
      const deltaStr = m.label === 'Total Outstanding' ? fmtRand(delta) : String(delta);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      textC(doc, color);
      const prevStr = m.label === 'Total Outstanding' ? fmtRand(m.prev) : String(m.prev);
      doc.text(`${arrow} ${deltaStr}  vs ${prevStr}`, cx + 4, cy + 23);
    }
  });
}

// ── Page 2 ────────────────────────────────────────────────────────────────────

function buildPage2(doc: jsPDF, d: HandlerPerformancePDFData) {
  const pageW = doc.internal.pageSize.getWidth();
  let y = 28;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  textC(doc, C.navy);
  doc.text('YOUR PORTFOLIO AT A GLANCE', 14, y);
  y += 8;

  // Doughnut chart (left half)
  const cx = 55;
  const cy = y + 38;
  const r = 30;
  const innerR = 18;

  const segments = [
    { value: d.portfolio.critical, color: C.red, label: 'Critical' },
    { value: d.portfolio.urgent, color: C.amber, label: 'Urgent' },
    { value: d.portfolio.standard, color: C.blue, label: 'Standard' },
    { value: d.portfolio.finalised, color: C.green, label: 'Finalised' },
  ].filter(s => s.value > 0);

  drawDoughnut(doc, cx, cy, r, innerR, segments);

  // Centre text
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  textC(doc, C.navy);
  doc.text(String(d.portfolio.totalOpen), cx, cy - 1, { align: 'center' });
  doc.setFontSize(6);
  textC(doc, C.gray);
  doc.text('open', cx, cy + 4, { align: 'center' });

  // Legend — horizontal row below the doughnut (stays within the left half)
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const legendRowY = cy + r + 8;
  const legendItemW = 44;
  const legendStartX = Math.max(14, cx - (segments.length * legendItemW) / 2);
  doc.setFontSize(7);
  segments.forEach((seg, i) => {
    const lx = legendStartX + i * legendItemW;
    doc.setFillColor(seg.color[0], seg.color[1], seg.color[2]);
    doc.rect(lx, legendRowY - 3, 3, 3, 'F');
    doc.setFont('helvetica', 'normal');
    textC(doc, C.navy);
    doc.text(`${seg.label}  ${seg.value}  (${((seg.value / total) * 100).toFixed(0)}%)`, lx + 5, legendRowY, { maxWidth: legendItemW - 6 });
  });

  doc.setFontSize(7);
  textC(doc, C.gray);
  doc.text(`Portfolio — ${d.portfolio.totalOpen} open claims`, cx, legendRowY + 8, { align: 'center' });

  // Bar chart — right half, safely separated from doughnut legend
  const chartX = pageW / 2 + 8;
  const chartY = y + 6;
  const chartW = pageW / 2 - 24;
  const chartH = 50;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  textC(doc, C.navy);
  doc.text('Claims Movement', chartX + chartW / 2, chartY - 2, { align: 'center' });

  drawBarChart(doc, chartX, chartY, chartW, chartH, [
    { label: 'Registered', bars: [{ value: d.registeredInPeriod, color: C.navy, label: 'New' }] },
    { label: 'Finalised', bars: [{ value: d.finalisedInPeriod, color: C.green, label: 'Closed' }] },
  ]);

  // Advance y past whichever section is taller
  const doughnutBottom = legendRowY + 14;
  const chartBottom = chartY + chartH + 10;
  y = Math.max(doughnutBottom, chartBottom) + 6;

  // Stuck claims callout
  if (d.stuckClaims.length > 0) {
    const boxY = y;
    const boxH = 20 + Math.min(d.stuckClaims.length, 6) * 6 + 10;
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(C.red[0], C.red[1], C.red[2]);
    doc.setLineWidth(1.2);
    doc.rect(14, boxY, 4, boxH, 'F');
    doc.setLineWidth(0.3);
    doc.rect(14, boxY, pageW - 28, boxH, 'S');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    textC(doc, C.red);
    doc.text('⚠  Claims With No Movement', 22, boxY + 8);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    textC(doc, C.darkRed);
    const fromStr = d.compareFrom ? fmtDate(d.compareFrom) : '—';
    doc.text(
      `${d.stuckClaims.length} claim${d.stuckClaims.length !== 1 ? 's' : ''} had no secondary status change between ${fromStr} and ${fmtDate(d.compareTo)}. These require your immediate attention.`,
      22, boxY + 15, { maxWidth: pageW - 40 },
    );

    autoTable(doc, {
      startY: boxY + 18,
      margin: { left: 22, right: 14 },
      head: [['Claim ID', 'Secondary Status', 'Days', 'Outstanding']],
      body: d.stuckClaims.slice(0, 6).map(c => [c.claimId, c.secondaryStatus, c.daysInStatus, fmtRand(c.outstanding)]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: C.red, textColor: C.white, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      theme: 'plain',
    });
  }
}

// ── Page 3 ────────────────────────────────────────────────────────────────────

function buildPage3(doc: jsPDF, d: HandlerPerformancePDFData) {
  const pageW = doc.internal.pageSize.getWidth();
  let y = 28;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  textC(doc, C.navy);
  doc.text("TODAY'S PRIORITY LIST", 14, y);
  y += 4;

  const totalAction = d.criticalItems.length + d.urgentItems.length + d.standardItems.length;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  textC(doc, C.gray);
  doc.text(`${totalAction} claim${totalAction !== 1 ? 's' : ''} requiring action`, 14, y + 4);
  y += 10;

  const sections = [
    {
      items: d.criticalItems,
      color: C.red as [number, number, number],
      label: `⚡ CRITICAL ACTION (${d.criticalItems.length})`,
      rowBg: [254, 242, 242] as [number, number, number],
    },
    {
      items: d.urgentItems,
      color: C.gold as [number, number, number],
      label: `⚠ URGENT (${d.urgentItems.length})`,
      rowBg: [255, 251, 235] as [number, number, number],
    },
    {
      items: d.standardItems,
      color: C.blue as [number, number, number],
      label: `✓ STANDARD (${d.standardItems.length})`,
      rowBg: [239, 246, 255] as [number, number, number],
    },
  ];

  for (const section of sections) {
    if (section.items.length === 0) continue;

    // Section header band
    doc.setFillColor(section.color[0], section.color[1], section.color[2]);
    doc.rect(14, y, pageW - 28, 7, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    textC(doc, section.color === C.gold ? C.navy : C.white);
    doc.text(section.label, 18, y + 5);
    y += 7;

    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [['Claim ID', 'Secondary Status', 'Days', 'Outstanding', 'TAT']],
      body: section.items.map(item => [
        item.claimId,
        item.secondaryStatus,
        item.daysInStatus,
        fmtRand(item.outstanding),
        item.tatStatus === 'ON TRACK' ? '' : item.tatStatus,
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [244, 246, 250], textColor: C.gray, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: section.rowBg },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: C.navy },
        4: { textColor: section.color === C.red ? C.darkRed : section.color, fontStyle: 'bold' },
      },
      theme: 'plain',
      didDrawPage: () => {},
    });

    const lastTable = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (lastTable?.finalY ?? y) + 4;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateHandlerPerformancePdf(data: HandlerPerformancePDFData): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const totalPages = 3;

  // Page 1
  drawHeader(doc, data.reportDate, data.compareFrom);
  buildPage1(doc, data);
  drawFooter(doc, data.handler, 1, totalPages);

  // Page 2
  doc.addPage();
  drawHeader(doc, data.reportDate, data.compareFrom);
  buildPage2(doc, data);
  drawFooter(doc, data.handler, 2, totalPages);

  // Page 3
  doc.addPage();
  drawHeader(doc, data.reportDate, data.compareFrom);
  buildPage3(doc, data);
  drawFooter(doc, data.handler, 3, totalPages);

  return doc.output('arraybuffer') as unknown as Uint8Array;
}
