import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadPoppins } from './pdf-fonts';

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

  statusChanges: number;
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
  urgentItems:   Array<{ claimId: string; secondaryStatus: string; daysInStatus: number; outstanding: number; tatStatus: 'BREACH' | 'AT RISK' | 'ON TRACK' }>;
  standardItems: Array<{ claimId: string; secondaryStatus: string; daysInStatus: number; outstanding: number; tatStatus: 'BREACH' | 'AT RISK' | 'ON TRACK' }>;

  portfolio: { critical: number; urgent: number; standard: number; finalised: number; totalOpen: number };
  registeredInPeriod: number;
  finalisedInPeriod: number;
}

// ── Palette (matches the app's Tailwind palette exactly) ──────────────────────

const C = {
  navy:       [13, 39, 97]    as [number, number, number],
  blue:       [30, 91, 198]   as [number, number, number],
  gold:       [245, 168, 0]   as [number, number, number],
  white:      [255, 255, 255] as [number, number, number],
  pageBg:     [248, 250, 255] as [number, number, number],  // #F8FAFF
  cardBorder: [232, 238, 248] as [number, number, number],  // #E8EEF8
  lightGray:  [244, 246, 250] as [number, number, number],  // #F4F6FA
  gray:       [107, 114, 128] as [number, number, number],  // #6B7280
  dimGray:    [156, 163, 175] as [number, number, number],  // #9CA3AF
  red:        [220, 38, 38]   as [number, number, number],
  darkRed:    [153, 27, 27]   as [number, number, number],
  lightRed:   [254, 242, 242] as [number, number, number],
  green:      [22, 163, 74]   as [number, number, number],
  darkGreen:  [22, 101, 52]   as [number, number, number],
  lightGreen: [240, 255, 244] as [number, number, number],
  amber:      [245, 158, 11]  as [number, number, number],
  lightAmber: [255, 251, 235] as [number, number, number],
  lightBlue:  [239, 246, 255] as [number, number, number],
};

// ── Font helpers ──────────────────────────────────────────────────────────────

type FontStyle = 'normal' | 'bold';
let _usePoppins = false;

function setFont(doc: jsPDF, style: FontStyle, size: number) {
  const family = _usePoppins ? 'Poppins' : 'helvetica';
  doc.setFont(family, style);
  doc.setFontSize(size);
}

function fill(doc: jsPDF, color: [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function stroke(doc: jsPDF, color: [number, number, number], width = 0.3) {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(width);
}

function textColor(doc: jsPDF, color: [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2]);
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-ZA', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function fmtRand(v: number): string {
  if (v >= 1_000_000) return `R${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `R${(v / 1_000).toFixed(0)}K`;
  return `R${v.toLocaleString('en-ZA')}`;
}

function deltaArrow(
  curr: number,
  prev: number | null,
  lowerIsBetter: boolean,
): { arrow: string; color: [number, number, number]; delta: number } {
  if (prev === null) return { arrow: '', color: C.gray, delta: 0 };
  const delta = curr - prev;
  if (delta === 0) return { arrow: '→', color: C.dimGray, delta: 0 };
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return { arrow: delta < 0 ? '↓' : '↑', color: improved ? C.green : C.red, delta };
}

// ── Page chrome ───────────────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, reportDate: string, compareFrom: string | null) {
  const W = doc.internal.pageSize.getWidth();

  // Full-width navy band
  fill(doc, C.navy);
  doc.rect(0, 0, W, 20, 'F');

  // Gold accent rule at bottom of header
  stroke(doc, C.gold, 0.8);
  doc.line(0, 20, W, 20);

  // Brand label
  setFont(doc, 'bold', 6.5);
  textColor(doc, C.gold);
  doc.text('SANTAM EMERGING BUSINESS', 14, 7.5);

  // Report title
  setFont(doc, 'bold', 9.5);
  textColor(doc, C.white);
  doc.text('Claims Performance Report', 14, 15);

  // Date — right aligned
  setFont(doc, 'normal', 7);
  textColor(doc, [180, 195, 225]);
  const dateLabel = compareFrom
    ? `${fmtDate(reportDate)}  ·  vs ${fmtDate(compareFrom)}`
    : fmtDate(reportDate);
  doc.text(dateLabel, W - 14, 12, { align: 'right' });
}

function drawFooter(doc: jsPDF, handler: string, page: number, total: number) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const y = H - 10;

  stroke(doc, C.cardBorder, 0.4);
  doc.line(14, y - 3, W - 14, y - 3);

  setFont(doc, 'normal', 6.5);
  textColor(doc, C.dimGray);
  doc.text('Santam Emerging Business — Claims Management', 14, y);
  doc.text(
    `Generated ${fmtDate(new Date().toISOString().split('T')[0])}   ·   Page ${page} of ${total}`,
    W / 2, y, { align: 'center' },
  );
  doc.text(
    `Confidential — ${handler}`,
    W - 14, y, { align: 'right' },
  );
}

// ── Reusable drawing primitives ───────────────────────────────────────────────

/** Thin-bordered card with optional left-accent strip */
function drawCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { accentColor?: [number, number, number]; bgColor?: [number, number, number] } = {},
) {
  const { accentColor, bgColor = C.white } = opts;
  fill(doc, bgColor);
  stroke(doc, C.cardBorder, 0.3);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD');
  if (accentColor) {
    fill(doc, accentColor);
    doc.rect(x, y, 3, h, 'F');
  }
}

/** Horizontal rule with label */
function sectionTitle(doc: jsPDF, x: number, y: number, label: string) {
  setFont(doc, 'bold', 7);
  textColor(doc, C.navy);
  doc.text(label, x, y);

  const W = doc.internal.pageSize.getWidth();
  stroke(doc, C.cardBorder, 0.3);
  doc.line(x, y + 2, W - 14, y + 2);
}

/** Unified card — same large aesthetic for every card on the report.
 *  Pass `prev` + `curr` + `lowerIsBetter` for comparison cards (shows delta).
 *  Pass `sub` for informational cards (shows a subtitle line instead). */
function drawUnifiedCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: {
    label: string;
    value: string;
    accent: [number, number, number];
    prev?: number | null;
    curr?: number;
    lowerIsBetter?: boolean;
    isRand?: boolean;
    sub?: string;
  },
) {
  const { label, value, accent, prev, curr, lowerIsBetter = true, isRand = false, sub } = opts;
  drawCard(doc, x, y, w, h, { accentColor: accent });

  // Label
  setFont(doc, 'normal', 7);
  textColor(doc, C.gray);
  doc.text(label.toUpperCase(), x + 8, y + 8);

  // Value
  setFont(doc, 'bold', 20);
  textColor(doc, C.navy);
  doc.text(value, x + 8, y + 22, { maxWidth: w - 14 });

  // Comparison delta (two lines) OR plain sub text
  if (prev !== null && prev !== undefined && curr !== undefined) {
    const { arrow, color, delta } = deltaArrow(curr, prev, lowerIsBetter);
    const deltaStr = isRand ? fmtRand(Math.abs(delta)) : String(Math.abs(delta));
    const prevStr  = isRand ? fmtRand(prev) : String(prev);

    setFont(doc, 'bold', 7);
    textColor(doc, color);
    doc.text(`${arrow} ${deltaStr}`, x + 8, y + 31);

    setFont(doc, 'normal', 6.5);
    textColor(doc, C.dimGray);
    doc.text(`vs ${prevStr}`, x + 8, y + 37);
  } else if (sub) {
    setFont(doc, 'normal', 6.5);
    textColor(doc, C.dimGray);
    doc.text(sub, x + 8, y + 31, { maxWidth: w - 14 });
  }
}

// ── Doughnut helper ───────────────────────────────────────────────────────────

function drawDoughnut(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  innerR: number,
  segments: Array<{ value: number; color: [number, number, number] }>,
) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return;
  let startAngle = -Math.PI / 2;
  const step = 0.025;

  for (const seg of segments) {
    if (seg.value === 0) continue;
    const angle = (seg.value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const pts: Array<[number, number]> = [];
    for (let a = startAngle; a <= endAngle; a += step)
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    pts.push([cx + r * Math.cos(endAngle), cy + r * Math.sin(endAngle)]);
    for (let a = endAngle; a >= startAngle; a -= step)
      pts.push([cx + innerR * Math.cos(a), cy + innerR * Math.sin(a)]);
    if (pts.length < 2) continue;
    fill(doc, seg.color);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    doc.lines(
      pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]] as [number, number]),
      pts[0][0], pts[0][1], [1, 1], 'FD', true,
    );
    startAngle = endAngle;
  }
}

// ── Bar chart helper ──────────────────────────────────────────────────────────

function drawBarChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  groups: Array<{ label: string; value: number; color: [number, number, number] }>,
) {
  const maxVal = Math.max(...groups.map(g => g.value), 1);
  const groupW = w / groups.length;
  const barW = groupW * 0.45;
  const barGap = (groupW - barW) / 2;

  // Grid lines
  stroke(doc, C.cardBorder, 0.25);
  for (let i = 0; i <= 4; i++) {
    const gy = y + h - (i / 4) * h;
    doc.line(x, gy, x + w, gy);
  }

  // Y-axis values
  setFont(doc, 'normal', 5.5);
  textColor(doc, C.dimGray);
  for (let i = 0; i <= 4; i++) {
    const val = Math.round((maxVal * i) / 4);
    const gy = y + h - (i / 4) * h;
    doc.text(String(val), x - 2, gy + 1, { align: 'right' });
  }

  groups.forEach((g, i) => {
    const bx = x + i * groupW + barGap;
    const barH = maxVal > 0 ? (g.value / maxVal) * h : 0;
    const by = y + h - barH;

    // Bar with rounded top
    fill(doc, g.color);
    doc.setDrawColor(g.color[0], g.color[1], g.color[2]);
    doc.setLineWidth(0);
    if (barH > 0) doc.roundedRect(bx, by, barW, barH, 1, 1, 'F');

    // Value above bar
    if (g.value > 0) {
      setFont(doc, 'bold', 7);
      textColor(doc, g.color);
      doc.text(String(g.value), bx + barW / 2, by - 2, { align: 'center' });
    }

    // Label below
    setFont(doc, 'normal', 6.5);
    textColor(doc, C.gray);
    doc.text(g.label, bx + barW / 2, y + h + 5.5, { align: 'center' });
  });
}

// ── Page 1: Summary + Metrics ─────────────────────────────────────────────────

function buildPage1(doc: jsPDF, d: HandlerPerformancePDFData) {
  const W = doc.internal.pageSize.getWidth();
  let y = 26;

  // Greeting
  setFont(doc, 'bold', 17);
  textColor(doc, C.navy);
  doc.text(`Good morning, ${d.firstName}.`, 14, y);
  y += 7;

  const periodLabel = d.compareFrom
    ? `${fmtDate(d.compareFrom)} — ${fmtDate(d.compareTo)}`
    : fmtDate(d.compareTo);
  setFont(doc, 'normal', 8);
  textColor(doc, C.gray);
  doc.text(`Performance snapshot  ·  ${periodLabel}`, 14, y);
  y += 9;

  // ── Unified 3×3 metrics grid ─────────────────────────────────────────────────
  sectionTitle(doc, 14, y, 'KEY METRICS');
  y += 6;

  const cardW  = (W - 28 - 8) / 3;  // 3 cols, 2 gaps of 4mm
  const cardH  = 43;                  // tall enough for two delta lines
  const colGap = 4;
  const rowGap = 4;

  const periodSub = d.compareFrom
    ? `${fmtDate(d.compareFrom)} — ${fmtDate(d.compareTo)}`
    : `as of ${fmtDate(d.compareTo)}`;

  const cards: Array<Parameters<typeof drawUnifiedCard>[5]> = [
    // Row 1 — period activity (informational)
    {
      label: 'Claims Registered', value: String(d.registeredInPeriod),
      accent: C.blue, sub: periodSub,
    },
    {
      label: 'Status Changes', value: String(d.statusChanges),
      accent: C.amber, sub: d.compareFrom ? periodSub : 'comparison required',
    },
    {
      label: 'No Movement', value: String(d.stuckClaims.length),
      accent: C.red, sub: 'critical & urgent — no status change',
    },
    // Row 2 — priority snapshot with comparison
    {
      label: 'Critical Claims', value: String(d.metrics.criticalCurrent),
      accent: C.red,
      curr: d.metrics.criticalCurrent, prev: d.metrics.criticalPrevious, lowerIsBetter: true,
    },
    {
      label: 'Urgent Claims', value: String(d.metrics.urgentCurrent),
      accent: C.amber,
      curr: d.metrics.urgentCurrent, prev: d.metrics.urgentPrevious, lowerIsBetter: true,
    },
    {
      label: 'Standard Claims', value: String(d.metrics.standardCurrent),
      accent: C.blue,
      curr: d.metrics.standardCurrent, prev: d.metrics.standardPrevious, lowerIsBetter: false,
    },
    // Row 3 — financials & outcomes with comparison
    {
      label: 'TAT Breaches', value: String(d.metrics.tatBreachesCurrent),
      accent: C.darkRed,
      curr: d.metrics.tatBreachesCurrent, prev: d.metrics.tatBreachesPrevious, lowerIsBetter: true,
    },
    {
      label: 'Est. Outstanding', value: fmtRand(d.metrics.totalOsCurrent),
      accent: C.navy,
      curr: d.metrics.totalOsCurrent, prev: d.metrics.totalOsPrevious, lowerIsBetter: true, isRand: true,
    },
    {
      label: 'Claims Finalised', value: String(d.metrics.finalisedCurrent),
      accent: C.green,
      curr: d.metrics.finalisedCurrent, prev: d.metrics.finalisedPrevious, lowerIsBetter: false,
    },
  ];

  cards.forEach((card, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    drawUnifiedCard(
      doc,
      14 + col * (cardW + colGap),
      y + row * (cardH + rowGap),
      cardW,
      cardH,
      card,
    );
  });

  y += 3 * (cardH + rowGap) + 4;

  // ── Highlights ──────────────────────────────────────────────────────────────
  sectionTitle(doc, 14, y, 'HIGHLIGHTS');
  y += 6;

  const winsLines: string[] = [];
  if (d.wins.finalisedCount > 0)
    winsLines.push(`Finalised ${d.wins.finalisedCount} claim${d.wins.finalisedCount !== 1 ? 's' : ''} between ${d.compareFrom ? fmtDate(d.compareFrom) : '—'} and ${fmtDate(d.compareTo)}.`);
  if (d.wins.movedOutOfCritical > 0)
    winsLines.push(`Moved ${d.wins.movedOutOfCritical} claim${d.wins.movedOutOfCritical !== 1 ? 's' : ''} out of critical.`);
  if (d.wins.improvedCount > 0)
    winsLines.push(`${d.wins.improvedCount} claim${d.wins.improvedCount !== 1 ? 's' : ''} improved priority.`);
  if (winsLines.length === 0)
    winsLines.push('No finalisations recorded for this comparison period — work the priority list on page 3.');

  const hasTable = d.resolvedClaims.length > 0;
  const winsH = hasTable ? 10 + winsLines.length * 6 + d.resolvedClaims.slice(0, 5).length * 6 + 6 : 10 + winsLines.length * 6 + 4;

  drawCard(doc, 14, y, W - 28, winsH, { accentColor: C.green, bgColor: C.lightGreen });
  setFont(doc, 'normal', 8);
  textColor(doc, C.darkGreen);
  winsLines.forEach((line, i) => doc.text(line, 20, y + 7 + i * 6, { maxWidth: W - 36 }));

  if (hasTable) {
    autoTable(doc, {
      startY: y + 7 + winsLines.length * 6 + 1,
      margin: { left: 20, right: 14 },
      head: [['Claim ID', 'Previous Status', 'Current Status', 'Outstanding']],
      body: d.resolvedClaims.slice(0, 5).map(c => [
        (c.currentStatus === null ? '✓ ' : '') + c.claimId,
        c.previousStatus, c.currentStatus ?? 'Resolved', fmtRand(c.outstanding),
      ]),
      styles: { fontSize: 7, cellPadding: [2, 3], font: _usePoppins ? 'Poppins' : 'helvetica' },
      headStyles: { fillColor: C.green, textColor: C.white, fontStyle: 'bold', fontSize: 6.5, cellPadding: [2, 3] },
      alternateRowStyles: { fillColor: [220, 252, 231] },
      theme: 'plain',
    });
  }
}

// ── Page 2: Portfolio + Stuck Claims ──────────────────────────────────────────

function buildPage2(doc: jsPDF, d: HandlerPerformancePDFData) {
  const W = doc.internal.pageSize.getWidth();
  let y = 26;

  sectionTitle(doc, 14, y, 'PORTFOLIO OVERVIEW');
  y += 8;

  // ── Doughnut ─────────────────────────────────────────────────────────────────
  const cx = 46;
  const cy = y + 28;
  const r  = 24;
  const innerR = 14;

  const segments = [
    { value: d.portfolio.critical, color: C.red,   label: 'Critical' },
    { value: d.portfolio.urgent,   color: C.amber,  label: 'Urgent'   },
    { value: d.portfolio.standard, color: C.blue,   label: 'Standard' },
    { value: d.portfolio.finalised,color: C.green,  label: 'Finalised'},
  ].filter(s => s.value > 0);

  drawDoughnut(doc, cx, cy, r, innerR, segments);

  // Centre text
  setFont(doc, 'bold', 9);
  textColor(doc, C.navy);
  doc.text(String(d.portfolio.totalOpen), cx, cy + 1, { align: 'center' });
  setFont(doc, 'normal', 6);
  textColor(doc, C.gray);
  doc.text('open', cx, cy + 5.5, { align: 'center' });

  // Legend — horizontal row below doughnut
  const total = segments.reduce((s, g) => s + g.value, 0) || 1;
  const legendY = cy + r + 8;
  const itemW = (2 * r + 12) / Math.max(segments.length, 1);
  const legendStartX = cx - r;
  segments.forEach((seg, i) => {
    const lx = legendStartX + i * itemW;
    fill(doc, seg.color);
    doc.rect(lx, legendY - 3, 3, 3, 'F');
    setFont(doc, 'normal', 6);
    textColor(doc, C.navy);
    doc.text(
      `${seg.label} ${seg.value} (${((seg.value / total) * 100).toFixed(0)}%)`,
      lx + 4.5,
      legendY,
      { maxWidth: itemW - 5 },
    );
  });

  setFont(doc, 'normal', 6);
  textColor(doc, C.dimGray);
  doc.text(`Portfolio breakdown — ${d.portfolio.totalOpen} open claims`, cx, legendY + 7, { align: 'center' });

  // ── Bar chart (right half) ────────────────────────────────────────────────────
  const chartX  = W / 2 + 8;
  const chartY  = y + 4;
  const chartW  = W / 2 - 22;
  const chartH  = 48;

  setFont(doc, 'bold', 8);
  textColor(doc, C.navy);
  doc.text('Claims Movement', chartX + chartW / 2, chartY - 3, { align: 'center' });

  drawBarChart(doc, chartX, chartY, chartW, chartH, [
    { label: 'Registered', value: d.registeredInPeriod, color: C.navy },
    { label: 'Finalised',  value: d.finalisedInPeriod,  color: C.green },
  ]);

  const doughnutBottom = legendY + 13;
  const chartBottom    = chartY + chartH + 12;
  y = Math.max(doughnutBottom, chartBottom) + 4;

  // ── Stuck claims ──────────────────────────────────────────────────────────────
  if (d.stuckClaims.length === 0) return;

  sectionTitle(doc, 14, y, 'NO MOVEMENT DETECTED');
  y += 6;

  const fromStr = d.compareFrom ? fmtDate(d.compareFrom) : '—';
  const calloutH = 12;
  drawCard(doc, 14, y, W - 28, calloutH, { accentColor: C.red, bgColor: C.lightRed });

  setFont(doc, 'normal', 7.5);
  textColor(doc, C.darkRed);
  doc.text(
    `${d.stuckClaims.length} claim${d.stuckClaims.length !== 1 ? 's' : ''} had no secondary status change between ${fromStr} and ${fmtDate(d.compareTo)}. Requires immediate action.`,
    20, y + 5, { maxWidth: W - 38 },
  );
  y += calloutH + 4;

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    head: [['Claim ID', 'Secondary Status', 'Days in Status', 'Outstanding']],
    body: d.stuckClaims.slice(0, 8).map(c => [
      c.claimId, c.secondaryStatus, String(c.daysInStatus), fmtRand(c.outstanding),
    ]),
    styles: {
      fontSize: 7, cellPadding: [2.5, 3],
      font: _usePoppins ? 'Poppins' : 'helvetica',
      textColor: C.navy,
    },
    headStyles: {
      fillColor: C.lightGray, textColor: C.gray,
      fontStyle: 'bold', fontSize: 6.5, cellPadding: [2.5, 3],
    },
    columnStyles: { 0: { fontStyle: 'bold', textColor: C.darkRed } },
    alternateRowStyles: { fillColor: C.lightRed },
    theme: 'plain',
  });
}

// ── Page 3: Priority Action List ──────────────────────────────────────────────

function buildPage3(doc: jsPDF, d: HandlerPerformancePDFData) {
  const W = doc.internal.pageSize.getWidth();
  let y = 26;

  const total = d.criticalItems.length + d.urgentItems.length + d.standardItems.length;
  sectionTitle(doc, 14, y, `TODAY'S PRIORITY LIST — ${total} CLAIM${total !== 1 ? 'S' : ''} REQUIRING ACTION`);
  y += 9;

  const sections = [
    {
      items: d.criticalItems,
      accent: C.red,
      bgRow: C.lightRed,
      label: `CRITICAL ACTION  (${d.criticalItems.length})`,
      colText: C.darkRed,
    },
    {
      items: d.urgentItems,
      accent: C.amber,
      bgRow: C.lightAmber,
      label: `URGENT  (${d.urgentItems.length})`,
      colText: C.amber,
    },
    {
      items: d.standardItems,
      accent: C.blue,
      bgRow: C.lightBlue,
      label: `STANDARD  (${d.standardItems.length})`,
      colText: C.blue,
    },
  ];

  for (const sec of sections) {
    if (sec.items.length === 0) continue;

    // Section header: accent strip + label
    drawCard(doc, 14, y, W - 28, 8, { accentColor: sec.accent, bgColor: C.lightGray });
    setFont(doc, 'bold', 7);
    textColor(doc, sec.accent);
    doc.text(sec.label, 20, y + 5.5);
    y += 8;

    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [['Claim ID', 'Secondary Status', 'Days', 'Outstanding', 'TAT']],
      body: sec.items.map(item => [
        item.claimId,
        item.secondaryStatus,
        String(item.daysInStatus),
        fmtRand(item.outstanding),
        item.tatStatus === 'ON TRACK' ? '' : item.tatStatus,
      ]),
      styles: {
        fontSize: 7, cellPadding: [2.5, 3],
        font: _usePoppins ? 'Poppins' : 'helvetica',
        textColor: C.navy,
      },
      headStyles: {
        fillColor: C.lightGray, textColor: C.gray,
        fontStyle: 'bold', fontSize: 6.5, cellPadding: [2.5, 3],
      },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: C.navy },
        4: { fontStyle: 'bold', textColor: sec.colText as [number, number, number] },
      },
      alternateRowStyles: { fillColor: sec.bgRow },
      theme: 'plain',
      didDrawPage: () => {},
    });

    const last = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (last?.finalY ?? y) + 5;
  }
}

// ── Main export (async for font loading) ──────────────────────────────────────

export async function generateHandlerPerformancePdf(
  data: HandlerPerformancePDFData,
): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Load Poppins — fall back to Helvetica if unavailable
  const fonts = await loadPoppins();
  if (fonts) {
    try {
      doc.addFileToVFS('Poppins-Regular.ttf', fonts.regular);
      doc.addFont('Poppins-Regular.ttf', 'Poppins', 'normal');
      doc.addFileToVFS('Poppins-Bold.ttf', fonts.bold);
      doc.addFont('Poppins-Bold.ttf', 'Poppins', 'bold');
      _usePoppins = true;
    } catch {
      _usePoppins = false;
    }
  } else {
    _usePoppins = false;
  }

  const TOTAL = 3;

  drawHeader(doc, data.reportDate, data.compareFrom);
  buildPage1(doc, data);
  drawFooter(doc, data.handler, 1, TOTAL);

  doc.addPage();
  drawHeader(doc, data.reportDate, data.compareFrom);
  buildPage2(doc, data);
  drawFooter(doc, data.handler, 2, TOTAL);

  doc.addPage();
  drawHeader(doc, data.reportDate, data.compareFrom);
  buildPage3(doc, data);
  drawFooter(doc, data.handler, 3, TOTAL);

  return doc.output('arraybuffer') as unknown as Uint8Array;
}
