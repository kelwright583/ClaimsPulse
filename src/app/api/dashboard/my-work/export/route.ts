import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import ExcelJS from 'exceljs';

// ── ARGB colour palette (FF prefix = 100 % opaque) ───────────────────────────
const A = {
  navy:         'FF0D2761',
  blue:         'FF1E5BC6',
  white:        'FFFFFFFF',
  offWhite:     'FFF8FAFF',
  lightGray:    'FFF3F4F6',
  gray:         'FF6B7280',
  darkGray:     'FF374151',
  charcoal:     'FF1F2937',
  border:       'FFE8EEF8',
  red:          'FFDC2626',
  darkRed:      'FF7F1D1D',
  lightRed:     'FFFEE2E2',
  redBorder:    'FFFCA5A5',
  amber:        'FFF59E0B',
  darkAmber:    'FFB45309',
  lightAmber:   'FFFEF3C7',
  amberBorder:  'FFFDE68A',
  green:        'FF16A34A',
  darkGreen:    'FF166534',
  lightGreen:   'FFDCFCE7',
  greenBorder:  'FF86EFAC',
  purple:       'FF7C3AED',
  darkPurple:   'FF4C1D95',
  lightPurple:  'FFEDE9FE',
  purpleBorder: 'FFC4B5FD',
  teal:         'FF0F766E',
  lightTeal:    'FFCCFBF1',
  tealBorder:   'FF5EEAD4',
  sectionBg:    'FFEEF2FF',
};

// ── ExcelJS style helpers ─────────────────────────────────────────────────────
function sf(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function tb(argb: string): ExcelJS.Borders {
  const b: ExcelJS.Border = { style: 'thin', color: { argb } };
  return { top: b, bottom: b, left: b, right: b };
}

function mbottom(argb: string): ExcelJS.Borders {
  return { bottom: { style: 'medium', color: { argb } } };
}

function font(
  bold: boolean,
  size: number,
  argb: string,
  italic = false,
  name = 'Calibri',
): Partial<ExcelJS.Font> {
  return { name, bold, size, color: { argb }, italic };
}

function align(
  h: ExcelJS.Alignment['horizontal'] = 'left',
  v: ExcelJS.Alignment['vertical'] = 'middle',
  wrap = false,
): Partial<ExcelJS.Alignment> {
  return { horizontal: h, vertical: v, wrapText: wrap };
}

// Apply full style to a cell
interface CellOpts {
  bg: string;
  fontColor: string;
  bold?: boolean;
  size?: number;
  italic?: boolean;
  h?: ExcelJS.Alignment['horizontal'];
  border?: string;   // argb for thin border
  wrap?: boolean;
}

function sc(
  cell: ExcelJS.Cell,
  value: string | number | null | undefined,
  o: CellOpts,
): void {
  cell.value = value ?? '—';
  cell.fill = sf(o.bg);
  cell.font = font(o.bold ?? false, o.size ?? 10, o.fontColor, o.italic ?? false) as ExcelJS.Font;
  cell.alignment = align(o.h ?? 'left', 'middle', o.wrap ?? false) as ExcelJS.Alignment;
  if (o.border) cell.border = tb(o.border) as ExcelJS.Borders;
}

// Fill a row's background without setting text
function fillRow(row: ExcelJS.Row, ncols: number, bgArgb: string): void {
  for (let c = 1; c <= ncols; c++) {
    row.getCell(c).fill = sf(bgArgb);
  }
}

// Add a full-width merged title/section row
function addMergedRow(
  ws: ExcelJS.Worksheet,
  text: string,
  ncols: number,
  o: CellOpts,
  height: number,
): void {
  const row = ws.addRow([text]);
  row.height = height;
  fillRow(row, ncols, o.bg);
  const cell = row.getCell(1);
  cell.value = text;
  cell.font = font(o.bold ?? true, o.size ?? 11, o.fontColor, o.italic ?? false) as ExcelJS.Font;
  cell.alignment = align('left', 'middle') as ExcelJS.Alignment;
  cell.fill = sf(o.bg);
  if (o.border) cell.border = mbottom(o.border) as ExcelJS.Borders;
  if (ncols > 1) ws.mergeCells(row.number, 1, row.number, ncols);
}

// Add a spacer row
function addSpacer(ws: ExcelJS.Worksheet, ncols: number, height: number, bg = A.white): void {
  const row = ws.addRow([]);
  row.height = height;
  fillRow(row, ncols, bg);
}

// Add a column header row
function addHeaderRow(
  ws: ExcelJS.Worksheet,
  headers: string[],
  bg: string,
  fontColor: string,
  height: number,
): ExcelJS.Row {
  const row = ws.addRow(headers);
  row.height = height;
  headers.forEach((_, i) => {
    const cell = row.getCell(i + 1);
    cell.fill = sf(bg);
    cell.font = font(true, 10, fontColor) as ExcelJS.Font;
    cell.alignment = align('center', 'middle') as ExcelJS.Alignment;
    cell.border = tb(A.border) as ExcelJS.Borders;
  });
  return row;
}

// ── Formatters ────────────────────────────────────────────────────────────────
function zarStr(v: number | null): string {
  if (v === null) return '—';
  return 'R\u00a0' + v.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function dateStr(d: Date): string {
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
}

function tatLabel(pos: string): string {
  if (pos === 'breach') return 'BREACH';
  if (pos === 'at-risk') return 'AT RISK';
  return 'ON TRACK';
}

// ── Data interfaces ───────────────────────────────────────────────────────────
type Priority = 'critical' | 'urgent' | 'standard';
type TatPos = 'breach' | 'at-risk' | 'on-track';

interface ActionItem {
  claimId: string;
  claimStatus: string | null;
  secondaryStatus: string | null;
  insured: string | null;
  cause: string | null;
  totalIncurred: number | null;
  totalOs: number | null;
  daysInStatus: number | null;
  priority: Priority;
  tatPosition: TatPos;
  hasOverdueDelay: boolean;
  handler: string | null;
}

interface PortfolioClaimRow {
  claimId: string;
  claimStatus: string | null;
  secondaryStatus: string | null;
  cause: string | null;
  daysOpen: number | null;
  totalIncurred: number | null;
  totalOs: number | null;
  tatPosition: TatPos;
  hasActiveDelay: boolean;
  handler: string | null;
}

interface CsScoreResult {
  total: number;
  speed: number;
  quality: number;
  coverage: number;
  finalisation: number;
  lastMonth: number | null;
  coachingNote: string;
}

interface TatBreachRow {
  secondaryStatus: string;
  count: number;
}

interface HandlerData {
  handler: string;
  snapshotDate: Date;
  actionItems: ActionItem[];
  pendingFinalisation: ActionItem[];
  portfolioStats: { openClaims: number; totalOutstanding: number; tatBreaches: number; activeDelays: number };
  portfolioClaims: PortfolioClaimRow[];
  csScore: CsScoreResult | null;
  tatBreaches: TatBreachRow[];
  notificationGap: { avg: number | null; teamAvg: number | null };
  weeklyTrend: { week: string; csScore: number | null }[];
}

// ── CS score computation ──────────────────────────────────────────────────────
async function computeCsScore(handler: string | null, snapshotDate: Date): Promise<CsScoreResult | null> {
  const hw = handler ? { handler } : {};
  const excl = { notIn: ['Finalised', 'Cancelled', 'Repudiated'] };

  const [openClaims, breachCount, reopenedCount] = await Promise.all([
    prisma.claimSnapshot.findMany({
      where: { snapshotDate, ...hw, claimStatus: excl },
      select: { daysInCurrentStatus: true, daysOpen: true, totalPaid: true },
    }),
    prisma.claimSnapshot.count({ where: { snapshotDate, ...hw, isTatBreach: true } }),
    prisma.claimSnapshot.count({
      where: { snapshotDate, ...hw, deltaFlags: { path: ['reopened'], equals: true } },
    }),
  ]);

  if (openClaims.length === 0) return null;
  const total = openClaims.length;

  const paidClaims = openClaims.filter(c => c.totalPaid && Number(c.totalPaid) > 0);
  const avgDaysToPay = paidClaims.length > 0
    ? paidClaims.reduce((s, c) => s + (c.daysOpen ?? c.daysInCurrentStatus ?? 0), 0) / paidClaims.length
    : 30;
  const speed = Math.max(0, Math.min(25, 25 - (avgDaysToPay / 30) * 25));

  const reopenRate = total > 0 ? reopenedCount / total : 0;
  const quality = Math.max(0, 25 - reopenRate * 25);

  const compliance = total > 0 ? (total - breachCount) / total : 1;
  const coverage = Math.min(25, compliance * 25);

  const finClaims = await prisma.claimSnapshot.findMany({
    where: { snapshotDate, ...hw, claimStatus: 'Finalised' },
    select: { daysInCurrentStatus: true, daysOpen: true },
  });
  const avgDaysOpen = finClaims.length > 0
    ? finClaims.reduce((s, c) => s + (c.daysOpen ?? c.daysInCurrentStatus ?? 0), 0) / finClaims.length
    : 90;
  const finalisation = Math.max(0, Math.min(25, 25 - (avgDaysOpen / 90) * 25));

  const r1 = (n: number) => Math.round(n * 10) / 10;

  const scores = [
    { val: speed,        note: 'Focus on issuing first payments earlier to improve response speed.' },
    { val: quality,      note: 'Reduce claim reopening by ensuring thorough assessment before closure.' },
    { val: coverage,     note: 'Address TAT breaches by prioritising claims approaching their deadline.' },
    { val: finalisation, note: 'Work to reduce the average time to close claims in your portfolio.' },
  ];
  const lowest = [...scores].sort((a, b) => a.val - b.val)[0];

  return {
    total: r1(speed + quality + coverage + finalisation),
    speed: r1(speed), quality: r1(quality), coverage: r1(coverage), finalisation: r1(finalisation),
    lastMonth: null,
    coachingNote: lowest.note,
  };
}

// ── Data fetcher per handler ──────────────────────────────────────────────────
function isPendingFinalisation(claimStatus: string | null, secondaryStatus: string | null): boolean {
  const st = (claimStatus ?? '').toLowerCase();
  const ss = (secondaryStatus ?? '').toLowerCase();
  return st.includes('processing') && ss.includes('claim settled');
}

async function fetchHandlerData(handler: string, snapshotDate: Date): Promise<HandlerData> {
  const hw = { handler };
  const excl = { notIn: ['Finalised', 'Cancelled', 'Repudiated'] };

  const snapshots = await prisma.claimSnapshot.findMany({
    where: { snapshotDate, claimStatus: excl, ...hw },
    select: {
      claimId: true, claimStatus: true, secondaryStatus: true,
      insured: true, cause: true, totalIncurred: true, totalOs: true,
      daysInCurrentStatus: true, isTatBreach: true, handler: true,
    },
  });

  const claimIds = snapshots.map(s => s.claimId);
  const [tatConfigs, delays] = await Promise.all([
    prisma.tatConfig.findMany({ where: { isActive: true } }),
    claimIds.length > 0
      ? prisma.acknowledgedDelay.findMany({
          where: { claimId: { in: claimIds }, isActive: true },
          select: { claimId: true, isOverdue: true, expectedDate: true },
        })
      : Promise.resolve([]),
  ]);
  const slaMap = new Map(tatConfigs.map(c => [c.secondaryStatus, c]));
  const delayMap = new Map(delays.map(d => [d.claimId, d]));

  const allItems: ActionItem[] = snapshots.map(s => {
    const tatCfg = s.secondaryStatus ? slaMap.get(s.secondaryStatus) : null;
    const delay = delayMap.get(s.claimId);
    let priority: Priority = 'standard';
    if (s.isTatBreach && tatCfg?.priority === 'critical') priority = 'critical';
    else if (s.isTatBreach || delay?.isOverdue) priority = 'urgent';
    let tatPosition: TatPos = 'on-track';
    if (s.isTatBreach) tatPosition = 'breach';
    else if (tatCfg && s.daysInCurrentStatus && s.daysInCurrentStatus > tatCfg.maxDays * 0.8) tatPosition = 'at-risk';
    return {
      claimId: s.claimId, claimStatus: s.claimStatus, secondaryStatus: s.secondaryStatus,
      insured: s.insured, cause: s.cause,
      totalIncurred: s.totalIncurred ? Number(s.totalIncurred) : null,
      totalOs: null,
      daysInStatus: s.daysInCurrentStatus, priority, tatPosition,
      hasOverdueDelay: delay?.isOverdue ?? false, handler: s.handler,
    };
  });

  const pOrder: Record<Priority, number> = { critical: 0, urgent: 1, standard: 2 };
  allItems.sort((a, b) => {
    const pd = pOrder[a.priority] - pOrder[b.priority];
    return pd !== 0 ? pd : (b.daysInStatus ?? 0) - (a.daysInStatus ?? 0);
  });

  const pendingFinalisation = allItems.filter(i => isPendingFinalisation(i.claimStatus, i.secondaryStatus));
  const actionItems = allItems.filter(i => !isPendingFinalisation(i.claimStatus, i.secondaryStatus));

  const portWhere = { snapshotDate, claimStatus: excl, ...hw };
  const [openCount, agg, tatBreachCount, portClaims] = await Promise.all([
    prisma.claimSnapshot.count({ where: portWhere }),
    prisma.claimSnapshot.aggregate({ where: portWhere, _sum: { totalOs: true } }),
    prisma.claimSnapshot.count({ where: { ...portWhere, isTatBreach: true } }),
    prisma.claimSnapshot.findMany({
      where: portWhere, take: 150, orderBy: { totalOs: 'desc' },
      select: {
        claimId: true, claimStatus: true, secondaryStatus: true, cause: true,
        daysInCurrentStatus: true, daysOpen: true, totalIncurred: true, totalOs: true,
        isTatBreach: true, handler: true,
      },
    }),
  ]);

  const portClaimIds = portClaims.map(r => r.claimId);
  const activeDelayRecs = portClaimIds.length > 0
    ? await prisma.acknowledgedDelay.findMany({
        where: { claimId: { in: portClaimIds }, isActive: true },
        select: { claimId: true },
      })
    : [];
  const activeDelaySet = new Set(activeDelayRecs.map(d => d.claimId));
  const activeDelaysCount = portClaimIds.length > 0
    ? await prisma.acknowledgedDelay.count({ where: { claimId: { in: portClaimIds }, isActive: true } })
    : 0;

  const portfolioClaims: PortfolioClaimRow[] = portClaims.map(r => {
    const tatCfg = r.secondaryStatus ? slaMap.get(r.secondaryStatus) : null;
    let tatPos: TatPos = 'on-track';
    if (r.isTatBreach) tatPos = 'breach';
    else if (tatCfg && r.daysInCurrentStatus && r.daysInCurrentStatus > tatCfg.maxDays * 0.8) tatPos = 'at-risk';
    return {
      claimId: r.claimId, claimStatus: r.claimStatus, secondaryStatus: r.secondaryStatus,
      cause: r.cause, daysOpen: r.daysOpen ?? r.daysInCurrentStatus,
      totalIncurred: r.totalIncurred ? Number(r.totalIncurred) : null,
      totalOs: r.totalOs ? Number(r.totalOs) : null,
      tatPosition: tatPos, hasActiveDelay: activeDelaySet.has(r.claimId), handler: r.handler,
    };
  });

  const csScore = await computeCsScore(handler, snapshotDate);

  const breachRaw = await prisma.claimSnapshot.groupBy({
    by: ['secondaryStatus'],
    where: { snapshotDate, isTatBreach: true, ...hw },
    _count: { claimId: true },
    orderBy: { _count: { claimId: 'desc' } },
  });
  const tatBreaches: TatBreachRow[] = breachRaw.map(r => ({
    secondaryStatus: r.secondaryStatus ?? 'Unknown',
    count: r._count.claimId,
  }));

  const [hGap, allGap] = await Promise.all([
    prisma.claimSnapshot.aggregate({
      where: { snapshotDate, ...hw, notificationGapDays: { not: null } },
      _avg: { notificationGapDays: true },
    }),
    prisma.claimSnapshot.aggregate({
      where: { snapshotDate, notificationGapDays: { not: null } },
      _avg: { notificationGapDays: true },
    }),
  ]);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const notificationGap = {
    avg: hGap._avg.notificationGapDays ? r1(Number(hGap._avg.notificationGapDays)) : null,
    teamAvg: allGap._avg.notificationGapDays ? r1(Number(allGap._avg.notificationGapDays)) : null,
  };

  const recentSnaps = await prisma.claimSnapshot.findMany({
    where: { snapshotDate: { lte: snapshotDate } },
    select: { snapshotDate: true },
    distinct: ['snapshotDate'],
    orderBy: { snapshotDate: 'desc' },
    take: 12,
  });
  const snapDatesAsc = [...recentSnaps].reverse();
  const weeklyTrend = await Promise.all(
    snapDatesAsc.map(async ({ snapshotDate: wsd }) => {
      const s = await computeCsScore(handler, wsd);
      return { week: wsd.toISOString().split('T')[0], csScore: s?.total ?? null };
    }),
  );

  return {
    handler, snapshotDate, actionItems, pendingFinalisation,
    portfolioStats: {
      openClaims: openCount,
      totalOutstanding: agg._sum.totalOs ? Number(agg._sum.totalOs) : 0,
      tatBreaches: tatBreachCount,
      activeDelays: activeDelaysCount,
    },
    portfolioClaims, csScore, tatBreaches, notificationGap, weeklyTrend,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Sheet builders ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function buildActionSheet(wb: ExcelJS.Workbook, dataSet: HandlerData[], isGroup: boolean): void {
  const ws = wb.addWorksheet("Today's Action Items");
  const NC = isGroup ? 8 : 7;

  const widths = isGroup
    ? [22, 15, 28, 26, 17, 7, 12, 13]
    : [15, 28, 26, 17, 7, 12, 13];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const sd = dataSet[0]?.snapshotDate;
  const label = isGroup
    ? `Today's Action Items  —  Group Report  (${dataSet.map(d => d.handler).join(', ')})`
    : `Today's Action Items  —  ${dataSet[0]?.handler ?? ''}`;

  // ── Sheet title ──
  addMergedRow(ws, `   ${label}`, NC,
    { bg: A.navy, fontColor: A.white, bold: true, size: 14 }, 32);
  addMergedRow(ws, `   Generated: ${sd ? dateStr(sd) : '—'}  ·  Claims pending finalisation are shown in a separate sheet`,
    NC, { bg: A.sectionBg, fontColor: A.gray, bold: false, size: 9, italic: true }, 14);
  addSpacer(ws, NC, 8);

  const headers = isGroup
    ? ['Handler', 'Claim ID', 'Secondary Status', 'Cause', 'Total Incurred', 'Days', 'Priority', 'TAT']
    : ['Claim ID', 'Secondary Status', 'Cause', 'Total Incurred', 'Days', 'Priority', 'TAT'];

  // ── Section writer ──
  function writeSection(
    label: string,
    items: ActionItem[],
    sectionBg: string,
    rowBg: string,
    rowBgAlt: string,
    rowFont: string,
    currencyFont: string,
    borderArgb: string,
  ) {
    if (items.length === 0) return;

    // Section banner
    addMergedRow(ws, `   ${label}   (${items.length})`, NC,
      { bg: sectionBg, fontColor: A.white, bold: true, size: 11 }, 24);

    // Column headers — dark charcoal so they stand out from section banner above
    addHeaderRow(ws, headers, A.charcoal, A.white, 22);

    items.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? rowBg : rowBgAlt;
      const tatBg =
        item.tatPosition === 'breach' ? A.lightRed :
        item.tatPosition === 'at-risk' ? A.lightAmber : A.lightGreen;
      const tatFg =
        item.tatPosition === 'breach' ? A.darkRed :
        item.tatPosition === 'at-risk' ? A.darkAmber : A.darkGreen;

      const row = ws.addRow([]);
      row.height = 19;

      const colData: Array<{ v: string | number | null; opts: CellOpts }> = isGroup
        ? [
            { v: item.handler ?? '—',              opts: { bg, fontColor: rowFont, bold: true,  border: borderArgb } },
            { v: item.claimId,                     opts: { bg, fontColor: rowFont, bold: true,  border: borderArgb } },
            { v: item.secondaryStatus ?? '—',      opts: { bg, fontColor: rowFont,              border: borderArgb } },
            { v: item.cause ?? '—',                opts: { bg, fontColor: rowFont,              border: borderArgb } },
            { v: zarStr(item.totalIncurred),        opts: { bg, fontColor: currencyFont, bold: true, h: 'right', border: borderArgb } },
            { v: item.daysInStatus ?? '—',         opts: { bg, fontColor: rowFont, h: 'center', border: borderArgb } },
            { v: item.priority.toUpperCase(),      opts: { bg, fontColor: rowFont, h: 'center', border: borderArgb } },
            { v: tatLabel(item.tatPosition),       opts: { bg: tatBg, fontColor: tatFg, bold: true, h: 'center', border: borderArgb } },
          ]
        : [
            { v: item.claimId,                     opts: { bg, fontColor: rowFont, bold: true,  border: borderArgb } },
            { v: item.secondaryStatus ?? '—',      opts: { bg, fontColor: rowFont,              border: borderArgb } },
            { v: item.cause ?? '—',                opts: { bg, fontColor: rowFont,              border: borderArgb } },
            { v: zarStr(item.totalIncurred),        opts: { bg, fontColor: currencyFont, bold: true, h: 'right', border: borderArgb } },
            { v: item.daysInStatus ?? '—',         opts: { bg, fontColor: rowFont, h: 'center', border: borderArgb } },
            { v: item.priority.toUpperCase(),      opts: { bg, fontColor: rowFont, h: 'center', border: borderArgb } },
            { v: tatLabel(item.tatPosition),       opts: { bg: tatBg, fontColor: tatFg, bold: true, h: 'center', border: borderArgb } },
          ];

      colData.forEach(({ v, opts }, ci) => sc(row.getCell(ci + 1), v, opts));
    });

    addSpacer(ws, NC, 6);
  }

  if (isGroup) {
    for (const d of dataSet) {
      addMergedRow(ws, `   Handler: ${d.handler}`, NC,
        { bg: A.charcoal, fontColor: A.white, bold: true, size: 11 }, 26);
      addSpacer(ws, NC, 4);

      const critical = d.actionItems.filter(i => i.priority === 'critical');
      const urgent   = d.actionItems.filter(i => i.priority === 'urgent');
      const standard = d.actionItems.filter(i => i.priority === 'standard');

      writeSection('⚡  CRITICAL ACTION', critical, A.red,       A.lightRed,   'FFFEF2F2', A.darkRed,   A.darkRed,   A.redBorder);
      writeSection('⚠  URGENT',          urgent,   A.darkAmber,  A.lightAmber, 'FFFFFBEB', A.darkAmber, A.darkAmber, A.amberBorder);
      writeSection('✓  STANDARD',        standard, A.blue,       A.offWhite,   A.white,    A.darkGray,  A.navy,      A.border);

      if (d.actionItems.length === 0) {
        addMergedRow(ws, '   All clear — no priority actions today.', NC,
          { bg: A.lightGreen, fontColor: A.darkGreen, bold: true, size: 10 }, 20);
      }
      addSpacer(ws, NC, 10);
    }
  } else {
    const d = dataSet[0];
    if (!d) return;
    const critical = d.actionItems.filter(i => i.priority === 'critical');
    const urgent   = d.actionItems.filter(i => i.priority === 'urgent');
    const standard = d.actionItems.filter(i => i.priority === 'standard');
    writeSection('⚡  CRITICAL ACTION', critical, A.red,       A.lightRed,   'FFFEF2F2', A.darkRed,   A.darkRed,   A.redBorder);
    writeSection('⚠  URGENT',          urgent,   A.darkAmber,  A.lightAmber, 'FFFFFBEB', A.darkAmber, A.darkAmber, A.amberBorder);
    writeSection('✓  STANDARD',        standard, A.blue,       A.offWhite,   A.white,    A.darkGray,  A.navy,      A.border);
    if (d.actionItems.length === 0) {
      addMergedRow(ws, '   All clear — no priority actions today.', NC,
        { bg: A.lightGreen, fontColor: A.darkGreen, bold: true, size: 10 }, 20);
    }
  }
}

function buildCsTatSheet(wb: ExcelJS.Workbook, dataSet: HandlerData[], isGroup: boolean): void {
  const ws = wb.addWorksheet('CS & TAT Health');
  const NC = 8;
  [30, 14, 30, 14, 30, 14, 14, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const sd = dataSet[0]?.snapshotDate;
  const label = isGroup
    ? `CS & TAT Health  —  Group Report  (${dataSet.map(d => d.handler).join(', ')})`
    : `CS & TAT Health  —  ${dataSet[0]?.handler ?? ''}`;

  addMergedRow(ws, `   ${label}`, NC,
    { bg: A.teal, fontColor: A.white, bold: true, size: 14 }, 32);
  addMergedRow(ws, `   Generated: ${sd ? dateStr(sd) : '—'}  ·  CS Score is out of 100 (4 components × 25 points each)`,
    NC, { bg: A.sectionBg, fontColor: A.gray, bold: false, size: 9, italic: true }, 14);

  for (const d of dataSet) {
    addSpacer(ws, NC, 10);

    if (isGroup) {
      addMergedRow(ws, `   Handler: ${d.handler}`, NC,
        { bg: A.charcoal, fontColor: A.white, bold: true, size: 11 }, 26);
      addSpacer(ws, NC, 6);
    }

    const cs = d.csScore;
    const trendDiff = cs?.lastMonth != null ? cs.total - cs.lastMonth : null;
    const totalGood = cs && cs.total >= 70;
    const totalOk   = cs && cs.total >= 50 && cs.total < 70;

    // ── KPI header labels ──
    const lblRow = ws.addRow(['CS SCORE', '', 'SPEED', '', 'QUALITY', '', 'COVERAGE', '']);
    lblRow.height = 16;
    [1,3,5,7].forEach(c => {
      const cell = lblRow.getCell(c);
      cell.fill = sf(A.navy); cell.font = font(true, 8, A.offWhite) as ExcelJS.Font;
      cell.alignment = align('center', 'middle') as ExcelJS.Alignment;
    });
    [2,4,6,8].forEach(c => { lblRow.getCell(c).fill = sf(A.navy); });
    ws.mergeCells(lblRow.number, 1, lblRow.number, 2);
    ws.mergeCells(lblRow.number, 3, lblRow.number, 4);
    ws.mergeCells(lblRow.number, 5, lblRow.number, 6);
    ws.mergeCells(lblRow.number, 7, lblRow.number, 8);

    // ── KPI values ──
    const totalBg = totalGood ? A.lightGreen : totalOk ? A.lightAmber : cs ? A.lightRed : A.offWhite;
    const totalFg = totalGood ? A.darkGreen  : totalOk ? A.darkAmber  : cs ? A.darkRed  : A.navy;
    const valRow = ws.addRow([
      cs ? `${cs.total}/100` : '—', '',
      cs ? `${cs.speed}/25` : '—', '',
      cs ? `${cs.quality}/25` : '—', '',
      cs ? `${cs.coverage}/25` : '—', '',
    ]);
    valRow.height = 36;
    ([[1, totalBg, totalFg], [3, A.sectionBg, A.navy], [5, A.sectionBg, A.navy], [7, A.sectionBg, A.navy]] as [number, string, string][])
      .forEach(([c, bg, fg]) => {
        const cell = valRow.getCell(c);
        cell.fill = sf(bg);
        cell.font = font(true, 20, fg) as ExcelJS.Font;
        cell.alignment = { horizontal: 'center', vertical: 'middle' } as ExcelJS.Alignment;
        cell.border = tb(A.border) as ExcelJS.Borders;
        valRow.getCell(c + 1).fill = sf(bg);
        valRow.getCell(c + 1).border = tb(A.border) as ExcelJS.Borders;
      });
    ws.mergeCells(valRow.number, 1, valRow.number, 2);
    ws.mergeCells(valRow.number, 3, valRow.number, 4);
    ws.mergeCells(valRow.number, 5, valRow.number, 6);
    ws.mergeCells(valRow.number, 7, valRow.number, 8);

    // ── KPI sub labels ──
    const subRow = ws.addRow([
      trendDiff !== null ? `${trendDiff >= 0 ? '+' : ''}${trendDiff} vs last month` : 'No prior data', '',
      'Days to first payment', '', 'Reopen rate impact', '', 'TAT compliance', '',
    ]);
    subRow.height = 14;
    [1,3,5,7].forEach(c => {
      const cell = subRow.getCell(c);
      cell.fill = sf(A.offWhite);
      cell.font = font(false, 8, A.gray, true) as ExcelJS.Font;
      cell.alignment = align('center', 'middle') as ExcelJS.Alignment;
      subRow.getCell(c + 1).fill = sf(A.offWhite);
    });
    ws.mergeCells(subRow.number, 1, subRow.number, 2);
    ws.mergeCells(subRow.number, 3, subRow.number, 4);
    ws.mergeCells(subRow.number, 5, subRow.number, 6);
    ws.mergeCells(subRow.number, 7, subRow.number, 8);

    addSpacer(ws, NC, 6);

    // ── Row 2 of KPI: Finalisation + Notification gap ──
    const lbl2 = ws.addRow(['FINALISATION', '', 'NOTIFICATION GAP', '', 'TEAM AVG', '', 'TREND', '']);
    lbl2.height = 16;
    [1,3,5,7].forEach(c => {
      const cell = lbl2.getCell(c);
      cell.fill = sf(A.navy); cell.font = font(true, 8, A.offWhite) as ExcelJS.Font;
      cell.alignment = align('center', 'middle') as ExcelJS.Alignment;
    });
    [2,4,6,8].forEach(c => { lbl2.getCell(c).fill = sf(A.navy); });
    ws.mergeCells(lbl2.number, 1, lbl2.number, 2);
    ws.mergeCells(lbl2.number, 3, lbl2.number, 4);
    ws.mergeCells(lbl2.number, 5, lbl2.number, 6);
    ws.mergeCells(lbl2.number, 7, lbl2.number, 8);

    const notifHigher = d.notificationGap.avg !== null && d.notificationGap.teamAvg !== null
      && d.notificationGap.avg > d.notificationGap.teamAvg;
    const notifBg = notifHigher ? A.lightRed : A.lightGreen;
    const notifFg = notifHigher ? A.darkRed  : A.darkGreen;

    const lastCs = d.weeklyTrend.length >= 2
      ? (d.weeklyTrend[d.weeklyTrend.length - 1].csScore ?? null)
      : null;
    const prevCs = d.weeklyTrend.length >= 2
      ? (d.weeklyTrend[d.weeklyTrend.length - 2].csScore ?? null)
      : null;
    const trendStr = lastCs !== null && prevCs !== null
      ? `${lastCs > prevCs ? '↑' : lastCs < prevCs ? '↓' : '→'} ${lastCs}/100`
      : '—';

    const val2 = ws.addRow([
      cs ? `${cs.finalisation}/25` : '—', '',
      d.notificationGap.avg !== null ? `${d.notificationGap.avg} days` : '—', '',
      d.notificationGap.teamAvg !== null ? `${d.notificationGap.teamAvg} days` : '—', '',
      trendStr, '',
    ]);
    val2.height = 36;
    [
      [1, A.sectionBg, A.navy],
      [3, notifBg, notifFg],
      [5, A.offWhite, A.navy],
      [7, A.offWhite, A.navy],
    ].forEach(([c, bg, fg]) => {
      const cell = val2.getCell(c as number);
      cell.fill = sf(bg as string);
      cell.font = font(true, 18, fg as string) as ExcelJS.Font;
      cell.alignment = { horizontal: 'center', vertical: 'middle' } as ExcelJS.Alignment;
      cell.border = tb(A.border) as ExcelJS.Borders;
      val2.getCell((c as number) + 1).fill = sf(bg as string);
      val2.getCell((c as number) + 1).border = tb(A.border) as ExcelJS.Borders;
    });
    ws.mergeCells(val2.number, 1, val2.number, 2);
    ws.mergeCells(val2.number, 3, val2.number, 4);
    ws.mergeCells(val2.number, 5, val2.number, 6);
    ws.mergeCells(val2.number, 7, val2.number, 8);

    const sub2 = ws.addRow(['Avg days to finalise', '', 'Your average', '', 'Team benchmark', '', 'vs previous period', '']);
    sub2.height = 14;
    [1,3,5,7].forEach(c => {
      const cell = sub2.getCell(c);
      cell.fill = sf(A.offWhite);
      cell.font = font(false, 8, A.gray, true) as ExcelJS.Font;
      cell.alignment = align('center', 'middle') as ExcelJS.Alignment;
      sub2.getCell(c + 1).fill = sf(A.offWhite);
    });
    ws.mergeCells(sub2.number, 1, sub2.number, 2);
    ws.mergeCells(sub2.number, 3, sub2.number, 4);
    ws.mergeCells(sub2.number, 5, sub2.number, 6);
    ws.mergeCells(sub2.number, 7, sub2.number, 8);

    // ── Coaching note ──
    if (cs?.coachingNote) {
      addSpacer(ws, NC, 6);
      addMergedRow(ws, `   COACHING NOTE  —  ${cs.coachingNote}`, NC,
        { bg: A.sectionBg, fontColor: A.navy, bold: true, size: 10 }, 26);
    }

    // ── TAT Breach Analysis ──
    addSpacer(ws, NC, 10);
    addMergedRow(ws, '   TAT BREACH ANALYSIS', NC,
      { bg: A.teal, fontColor: A.white, bold: true, size: 11 }, 24);
    addHeaderRow(ws, ['Secondary Status', 'Breach Count', '', '', '', '', '', ''].slice(0, NC),
      A.charcoal, A.white, 22);

    if (d.tatBreaches.length === 0) {
      addMergedRow(ws, '   No TAT breaches recorded.', NC,
        { bg: A.lightGreen, fontColor: A.darkGreen, bold: false, size: 10 }, 18);
    } else {
      d.tatBreaches.forEach((b, idx) => {
        const bg = idx % 2 === 0 ? A.white : A.offWhite;
        const row = ws.addRow([]);
        row.height = 19;
        sc(row.getCell(1), b.secondaryStatus, { bg, fontColor: A.darkGray, bold: true, border: A.border });
        sc(row.getCell(2), b.count,           { bg: A.lightRed, fontColor: A.darkRed, bold: true, h: 'center', border: A.redBorder });
        for (let c = 3; c <= NC; c++) { row.getCell(c).fill = sf(bg); }
      });
    }

    // ── Weekly CS Trend ──
    addSpacer(ws, NC, 10);
    addMergedRow(ws, '   12-WEEK CS SCORE TREND', NC,
      { bg: A.teal, fontColor: A.white, bold: true, size: 11 }, 24);
    addHeaderRow(ws, ['Week', 'CS Score', '', '', '', '', '', ''].slice(0, NC),
      A.charcoal, A.white, 22);

    if (d.weeklyTrend.length === 0) {
      addMergedRow(ws, '   No trend data available.', NC,
        { bg: A.offWhite, fontColor: A.gray, bold: false, size: 10 }, 18);
    } else {
      d.weeklyTrend.forEach((pt, idx) => {
        const bg = idx % 2 === 0 ? A.white : A.offWhite;
        const score = pt.csScore;
        const scoreBg = score !== null ? (score >= 70 ? A.lightGreen : score >= 50 ? A.lightAmber : A.lightRed) : A.offWhite;
        const scoreFg = score !== null ? (score >= 70 ? A.darkGreen : score >= 50 ? A.darkAmber : A.darkRed) : A.gray;
        const row = ws.addRow([]);
        row.height = 19;
        sc(row.getCell(1), pt.week,                           { bg, fontColor: A.darkGray, border: A.border });
        sc(row.getCell(2), score !== null ? score : '—', { bg: scoreBg, fontColor: scoreFg, bold: true, h: 'center', border: A.border });
        for (let c = 3; c <= NC; c++) { row.getCell(c).fill = sf(bg); }
      });
    }
  }
}

function buildPortfolioSheet(wb: ExcelJS.Workbook, dataSet: HandlerData[], isGroup: boolean): void {
  const ws = wb.addWorksheet('My Portfolio');
  const NC = isGroup ? 9 : 8;
  const widths = isGroup
    ? [22, 15, 17, 28, 24, 7, 17, 17, 12]
    : [15, 17, 28, 24, 7, 17, 17, 12];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const sd = dataSet[0]?.snapshotDate;
  const label = isGroup
    ? `My Portfolio  —  Group Report  (${dataSet.map(d => d.handler).join(', ')})`
    : `My Portfolio  —  ${dataSet[0]?.handler ?? ''}`;

  addMergedRow(ws, `   ${label}`, NC,
    { bg: A.navy, fontColor: A.white, bold: true, size: 14 }, 32);
  addMergedRow(ws,
    `   Generated: ${sd ? dateStr(sd) : '—'}  ·  Up to 150 claims per handler, ordered by outstanding amount`,
    NC, { bg: A.sectionBg, fontColor: A.gray, bold: false, size: 9, italic: true }, 14);

  const headers = isGroup
    ? ['Handler', 'Claim ID', 'Status', 'Secondary Status', 'Cause', 'Days', 'Total Incurred', 'Outstanding', 'TAT']
    : ['Claim ID', 'Status', 'Secondary Status', 'Cause', 'Days', 'Total Incurred', 'Outstanding', 'TAT'];

  for (const d of dataSet) {
    addSpacer(ws, NC, 10);

    if (isGroup) {
      addMergedRow(ws, `   Handler: ${d.handler}`, NC,
        { bg: A.charcoal, fontColor: A.white, bold: true, size: 11 }, 26);
      addSpacer(ws, NC, 4);
    }

    // Stats block (4 KPI tiles)
    const stats = d.portfolioStats;
    const statDefs: Array<{ label: string; value: string | number; bad?: boolean; warn?: boolean }> = [
      { label: 'OPEN CLAIMS',       value: stats.openClaims },
      { label: 'TOTAL OUTSTANDING', value: zarStr(stats.totalOutstanding) },
      { label: 'TAT BREACHES',      value: stats.tatBreaches, bad: stats.tatBreaches > 0 },
      { label: 'ACTIVE DELAYS',     value: stats.activeDelays, warn: stats.activeDelays > 0 },
    ];

    const statLabelRow = ws.addRow(statDefs.map(s => s.label));
    statLabelRow.height = 16;
    statDefs.forEach((_, i) => {
      const cell = statLabelRow.getCell(i + 1);
      cell.fill = sf(A.navy);
      cell.font = font(true, 8, A.offWhite) as ExcelJS.Font;
      cell.alignment = align('center', 'middle') as ExcelJS.Alignment;
    });
    for (let c = 5; c <= NC; c++) { statLabelRow.getCell(c).fill = sf(A.navy); }

    const statValRow = ws.addRow(statDefs.map(s => s.value));
    statValRow.height = 32;
    statDefs.forEach((s, i) => {
      const bg = s.bad ? A.red : s.warn ? A.amber : A.blue;
      const cell = statValRow.getCell(i + 1);
      cell.fill = sf(bg);
      cell.font = font(true, 16, A.white) as ExcelJS.Font;
      cell.alignment = align('center', 'middle') as ExcelJS.Alignment;
      cell.border = tb(A.navy) as ExcelJS.Borders;
    });
    for (let c = 5; c <= NC; c++) { statValRow.getCell(c).fill = sf(A.navy); }

    addSpacer(ws, NC, 8);
    addHeaderRow(ws, headers, A.charcoal, A.white, 22);

    if (d.portfolioClaims.length === 0) {
      addMergedRow(ws, '   No claims in portfolio.', NC,
        { bg: A.offWhite, fontColor: A.gray, bold: false, size: 10 }, 18);
    } else {
      d.portfolioClaims.forEach((claim, idx) => {
        const bg = idx % 2 === 0 ? A.white : A.offWhite;
        const tatBg =
          claim.tatPosition === 'breach' ? A.lightRed :
          claim.tatPosition === 'at-risk' ? A.lightAmber : A.lightGreen;
        const tatFg =
          claim.tatPosition === 'breach' ? A.darkRed :
          claim.tatPosition === 'at-risk' ? A.darkAmber : A.darkGreen;

        const row = ws.addRow([]);
        row.height = 19;

        const colData: Array<{ v: string | number | null; opts: CellOpts }> = isGroup
          ? [
              { v: claim.handler ?? '—',          opts: { bg, fontColor: A.navy, bold: true, border: A.border } },
              { v: claim.claimId,                  opts: { bg, fontColor: A.navy, bold: true, border: A.border } },
              { v: claim.claimStatus ?? '—',       opts: { bg, fontColor: A.darkGray, border: A.border } },
              { v: claim.secondaryStatus ?? '—',   opts: { bg, fontColor: A.darkGray, border: A.border } },
              { v: claim.cause ?? '—',             opts: { bg, fontColor: A.darkGray, border: A.border } },
              { v: claim.daysOpen ?? '—',          opts: { bg, fontColor: A.darkGray, h: 'center', border: A.border } },
              { v: zarStr(claim.totalIncurred),     opts: { bg, fontColor: A.navy, bold: true, h: 'right', border: A.border } },
              { v: zarStr(claim.totalOs),           opts: { bg, fontColor: A.navy, bold: true, h: 'right', border: A.border } },
              { v: tatLabel(claim.tatPosition),    opts: { bg: tatBg, fontColor: tatFg, bold: true, h: 'center', border: A.border } },
            ]
          : [
              { v: claim.claimId,                  opts: { bg, fontColor: A.navy, bold: true, border: A.border } },
              { v: claim.claimStatus ?? '—',       opts: { bg, fontColor: A.darkGray, border: A.border } },
              { v: claim.secondaryStatus ?? '—',   opts: { bg, fontColor: A.darkGray, border: A.border } },
              { v: claim.cause ?? '—',             opts: { bg, fontColor: A.darkGray, border: A.border } },
              { v: claim.daysOpen ?? '—',          opts: { bg, fontColor: A.darkGray, h: 'center', border: A.border } },
              { v: zarStr(claim.totalIncurred),     opts: { bg, fontColor: A.navy, bold: true, h: 'right', border: A.border } },
              { v: zarStr(claim.totalOs),           opts: { bg, fontColor: A.navy, bold: true, h: 'right', border: A.border } },
              { v: tatLabel(claim.tatPosition),    opts: { bg: tatBg, fontColor: tatFg, bold: true, h: 'center', border: A.border } },
            ];

        colData.forEach(({ v, opts }, ci) => sc(row.getCell(ci + 1), v, opts));
      });
    }

    if (isGroup) addSpacer(ws, NC, 10);
  }
}

function buildPendingFinalisationSheet(wb: ExcelJS.Workbook, dataSet: HandlerData[], isGroup: boolean): void {
  const ws = wb.addWorksheet('Pending Finalisation');
  const NC = isGroup ? 7 : 6;
  const widths = isGroup
    ? [22, 15, 28, 26, 17, 7, 13]
    : [15, 28, 26, 17, 7, 13];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const sd = dataSet[0]?.snapshotDate;
  const totalCount = dataSet.reduce((s, d) => s + d.pendingFinalisation.length, 0);

  addMergedRow(ws, '   Pending Finalisation  —  Claims Settled', NC,
    { bg: A.purple, fontColor: A.white, bold: true, size: 14 }, 32);
  addMergedRow(ws,
    `   Generated: ${sd ? dateStr(sd) : '—'}  ·  ${totalCount} claim${totalCount !== 1 ? 's' : ''} marked as "Claim Settled" but still in Processing status  ·  Excluded from Today's Action Items`,
    NC, { bg: A.lightPurple, fontColor: A.darkPurple, bold: false, size: 9, italic: true }, 14);
  addSpacer(ws, NC, 8);

  const headers = isGroup
    ? ['Handler', 'Claim ID', 'Secondary Status', 'Cause', 'Total Incurred', 'Days', 'TAT']
    : ['Claim ID', 'Secondary Status', 'Cause', 'Total Incurred', 'Days', 'TAT'];

  for (const d of dataSet) {
    if (isGroup) {
      addMergedRow(ws, `   Handler: ${d.handler}`, NC,
        { bg: A.charcoal, fontColor: A.white, bold: true, size: 11 }, 26);
      addSpacer(ws, NC, 4);
    }

    if (d.pendingFinalisation.length === 0) {
      addMergedRow(ws, '   No pending finalisation claims.', NC,
        { bg: A.lightPurple, fontColor: A.darkPurple, bold: false, size: 10 }, 18);
      if (isGroup) addSpacer(ws, NC, 8);
      continue;
    }

    addHeaderRow(ws, headers, A.purple, A.white, 22);

    d.pendingFinalisation.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? A.lightPurple : A.white;
      const tatBg =
        item.tatPosition === 'breach' ? A.lightRed :
        item.tatPosition === 'at-risk' ? A.lightAmber : A.lightGreen;
      const tatFg =
        item.tatPosition === 'breach' ? A.darkRed :
        item.tatPosition === 'at-risk' ? A.darkAmber : A.darkGreen;

      const row = ws.addRow([]);
      row.height = 19;

      const colData: Array<{ v: string | number | null; opts: CellOpts }> = isGroup
        ? [
            { v: item.handler ?? '—',          opts: { bg, fontColor: A.darkPurple, bold: true, border: A.purpleBorder } },
            { v: item.claimId,                  opts: { bg, fontColor: A.darkPurple, bold: true, border: A.purpleBorder } },
            { v: item.secondaryStatus ?? '—',   opts: { bg, fontColor: A.darkPurple, border: A.purpleBorder } },
            { v: item.cause ?? '—',             opts: { bg, fontColor: A.darkPurple, border: A.purpleBorder } },
            { v: zarStr(item.totalIncurred),     opts: { bg, fontColor: A.darkPurple, bold: true, h: 'right', border: A.purpleBorder } },
            { v: item.daysInStatus ?? '—',      opts: { bg, fontColor: A.darkPurple, h: 'center', border: A.purpleBorder } },
            { v: tatLabel(item.tatPosition),    opts: { bg: tatBg, fontColor: tatFg, bold: true, h: 'center', border: A.purpleBorder } },
          ]
        : [
            { v: item.claimId,                  opts: { bg, fontColor: A.darkPurple, bold: true, border: A.purpleBorder } },
            { v: item.secondaryStatus ?? '—',   opts: { bg, fontColor: A.darkPurple, border: A.purpleBorder } },
            { v: item.cause ?? '—',             opts: { bg, fontColor: A.darkPurple, border: A.purpleBorder } },
            { v: zarStr(item.totalIncurred),     opts: { bg, fontColor: A.darkPurple, bold: true, h: 'right', border: A.purpleBorder } },
            { v: item.daysInStatus ?? '—',      opts: { bg, fontColor: A.darkPurple, h: 'center', border: A.purpleBorder } },
            { v: tatLabel(item.tatPosition),    opts: { bg: tatBg, fontColor: tatFg, bold: true, h: 'center', border: A.purpleBorder } },
          ];

      colData.forEach(({ v, opts }, ci) => sc(row.getCell(ci + 1), v, opts));
    });

    if (isGroup) addSpacer(ws, NC, 10);
  }

  if (totalCount === 0 && !isGroup) {
    addMergedRow(ws, '   No pending finalisation claims.', NC,
      { bg: A.lightPurple, fontColor: A.darkPurple, bold: false, size: 10 }, 20);
  }
}

function buildWorkbook(dataSet: HandlerData[], isGroup: boolean): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SEB Hub';
  wb.created = new Date();
  wb.modified = new Date();

  buildActionSheet(wb, dataSet, isGroup);
  buildCsTatSheet(wb, dataSet, isGroup);
  buildPortfolioSheet(wb, dataSet, isGroup);
  buildPendingFinalisationSheet(wb, dataSet, isGroup);

  return wb;
}

// ── Route handler ─────────────────────────────────────────────────────────────
async function getLatestSnapshotDate(): Promise<Date | null> {
  const r = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  return r?.snapshotDate ?? null;
}

export async function POST(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json() as {
      handler?: string;
      handlers?: string[];
      reportType: 'individual' | 'group';
    };

    const { reportType } = body;
    const snapshotDate = await getLatestSnapshotDate();
    if (!snapshotDate) {
      return NextResponse.json({ error: 'No snapshot data available' }, { status: 404 });
    }

    let handlerNames: string[] = [];
    if (reportType === 'individual' && body.handler) {
      handlerNames = [body.handler];
    } else if (reportType === 'group' && Array.isArray(body.handlers) && body.handlers.length > 0) {
      handlerNames = body.handlers;
    } else {
      return NextResponse.json({ error: 'Invalid request: provide handler or handlers' }, { status: 400 });
    }

    if (ctx.role === 'CLAIMS_TECHNICIAN') {
      const ownName = ctx.fullName ?? '';
      handlerNames = handlerNames.filter(h => h === ownName);
      if (handlerNames.length === 0) handlerNames = [ownName];
    }

    const dataSet = await Promise.all(
      handlerNames.map(h => fetchHandlerData(h, snapshotDate)),
    );

    const wb = buildWorkbook(dataSet, reportType === 'group');
    const buffer = await wb.xlsx.writeBuffer();

    const today = new Date().toISOString().split('T')[0];
    const filename = reportType === 'group'
      ? `Group_Report_${today}.xlsx`
      : `${handlerNames[0].replace(/\s+/g, '_')}_Daily_Report_${today}.xlsx`;

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Filename': filename,
      },
    });
  } catch (e) {
    console.error('[export]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
