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
  return { top: b, bottom: b, left: b, right: b, diagonal: b };
}

function mbottom(argb: string): ExcelJS.Borders {
  const none: ExcelJS.Border = { style: 'thin', color: { argb: '00000000' } };
  const med: ExcelJS.Border = { style: 'medium', color: { argb } };
  return { top: none, left: none, right: none, bottom: med, diagonal: none };
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

function lastActionedStr(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
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

interface AssessorAppointedRow {
  claimId: string;
  handler: string | null;
  cause: string | null;
  daysInStatus: number | null;
  tatMaxDays: number | null;
  overdueDays: number | null;
}

interface WeeklyDeltaData {
  weekStartDate: Date | null;
  periodDays: number;
  newClaims: number;
  finalisedClaims: number;
  statusChanges: number;
  avgClaimsPerDay: number;
  avgStatusChangesPerDay: number;
  totalOsLatest: number;
  totalOsWeekAgo: number;
  valueChangePct: number | null;
  openClaimsLatest: number;
  openClaimsWeekAgo: number;
}

interface HandlerData {
  handler: string;
  snapshotDate: Date;
  actionItems: ActionItem[];
  pendingFinalisation: ActionItem[];
  assessorAppointed: AssessorAppointedRow[];
  weeklyDelta: WeeklyDeltaData;
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
function isPendingFinalisation(_claimStatus: string | null, secondaryStatus: string | null): boolean {
  return (secondaryStatus ?? '').toLowerCase().includes('claim settled');
}

function isExportExcluded(secondaryStatus: string | null): boolean {
  const ss = (secondaryStatus ?? '').toLowerCase();
  return ss.includes('own damage claim finalised') && ss.includes('tp claim in process');
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
    // Compute TAT breach from secondaryStatus vs TAT matrix
    const computedTatBreach = tatCfg ? (s.daysInCurrentStatus ?? 0) > tatCfg.maxDays : false;
    let priority: Priority = 'standard';
    if (computedTatBreach && tatCfg?.priority === 'critical') priority = 'critical';
    else if (computedTatBreach || delay?.isOverdue) priority = 'urgent';
    let tatPosition: TatPos = 'on-track';
    if (computedTatBreach) tatPosition = 'breach';
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
  const actionItems = allItems.filter(i => !isPendingFinalisation(i.claimStatus, i.secondaryStatus) && !isExportExcluded(i.secondaryStatus));

  // Assessor Appointed claims — days in status vs TAT limit
  const assessorTatKey = [...slaMap.keys()].find(k => k.toLowerCase().includes('assessor appointed'));
  const assessorTatMaxDays = assessorTatKey ? (slaMap.get(assessorTatKey)?.maxDays ?? null) : null;
  const assessorAppointed: AssessorAppointedRow[] = snapshots
    .filter(s => (s.secondaryStatus ?? '').toLowerCase().includes('assessor appointed'))
    .map(s => {
      const days = s.daysInCurrentStatus ?? null;
      const overdue = days !== null && assessorTatMaxDays !== null && days > assessorTatMaxDays
        ? days - assessorTatMaxDays : null;
      return { claimId: s.claimId, handler: s.handler, cause: s.cause, daysInStatus: days, tatMaxDays: assessorTatMaxDays, overdueDays: overdue };
    })
    .sort((a, b) => (b.daysInStatus ?? 0) - (a.daysInStatus ?? 0));

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

  const portfolioClaims: PortfolioClaimRow[] = portClaims.filter(r => !isExportExcluded(r.secondaryStatus)).map(r => {
    const tatCfg = r.secondaryStatus ? slaMap.get(r.secondaryStatus) : null;
    const computedBreach = tatCfg ? (r.daysInCurrentStatus ?? 0) > tatCfg.maxDays : false;
    let tatPos: TatPos = 'on-track';
    if (computedBreach) tatPos = 'breach';
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

  // ── Weekly delta ─────────────────────────────────────────────────────────────
  const weekAgoDateRow = await prisma.claimSnapshot.findFirst({
    where: { snapshotDate: { lte: new Date(snapshotDate.getTime() - 6 * 86400000) }, ...hw },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  const weekAgoDate = weekAgoDateRow?.snapshotDate ?? null;

  const [latestAllSnaps, weekAgoSnaps] = await Promise.all([
    prisma.claimSnapshot.findMany({
      where: { snapshotDate, ...hw },
      select: { claimId: true, secondaryStatus: true, totalOs: true, claimStatus: true },
    }),
    weekAgoDate
      ? prisma.claimSnapshot.findMany({
          where: { snapshotDate: weekAgoDate, ...hw },
          select: { claimId: true, secondaryStatus: true, totalOs: true, claimStatus: true },
        })
      : Promise.resolve([]),
  ]);

  const weekAgoIds = new Set(weekAgoSnaps.map(s => s.claimId));
  const weekAgoMap = new Map(weekAgoSnaps.map(s => [s.claimId, s]));
  const closedSt = ['Finalised', 'Cancelled', 'Repudiated'];
  const isOpen = (cs: string | null) => !closedSt.includes(cs ?? '');

  const wNewClaims = latestAllSnaps.filter(s => !weekAgoIds.has(s.claimId)).length;
  const wFinalised = latestAllSnaps.filter(s => {
    const prev = weekAgoMap.get(s.claimId);
    return !isOpen(s.claimStatus) && prev !== undefined && isOpen(prev.claimStatus);
  }).length;
  const wStatusChanges = latestAllSnaps.filter(s => {
    const prev = weekAgoMap.get(s.claimId);
    return prev !== undefined && prev.secondaryStatus !== s.secondaryStatus;
  }).length;
  const wOsNow  = latestAllSnaps.filter(s => isOpen(s.claimStatus)).reduce((sum, s) => sum + (s.totalOs ? Number(s.totalOs) : 0), 0);
  const wOsPrev = weekAgoSnaps.filter(s => isOpen(s.claimStatus)).reduce((sum, s) => sum + (s.totalOs ? Number(s.totalOs) : 0), 0);
  const wOpenNow  = latestAllSnaps.filter(s => isOpen(s.claimStatus)).length;
  const wOpenPrev = weekAgoSnaps.filter(s => isOpen(s.claimStatus)).length;
  const wDays = weekAgoDate ? Math.max(1, Math.round((snapshotDate.getTime() - weekAgoDate.getTime()) / 86400000)) : 7;
  const r1w = (n: number) => Math.round(n * 10) / 10;

  const weeklyDelta: WeeklyDeltaData = {
    weekStartDate: weekAgoDate,
    periodDays: wDays,
    newClaims: wNewClaims,
    finalisedClaims: wFinalised,
    statusChanges: wStatusChanges,
    avgClaimsPerDay: r1w(wNewClaims / wDays),
    avgStatusChangesPerDay: r1w(wStatusChanges / wDays),
    totalOsLatest: wOsNow,
    totalOsWeekAgo: wOsPrev,
    valueChangePct: wOsPrev > 0 ? r1w((wOsNow - wOsPrev) / wOsPrev * 100) : null,
    openClaimsLatest: wOpenNow,
    openClaimsWeekAgo: wOpenPrev,
  };

  return {
    handler, snapshotDate, actionItems, pendingFinalisation, assessorAppointed,
    portfolioStats: {
      openClaims: openCount,
      totalOutstanding: agg._sum.totalOs ? Number(agg._sum.totalOs) : 0,
      tatBreaches: tatBreachCount,
      activeDelays: activeDelaysCount,
    },
    portfolioClaims, csScore, tatBreaches, notificationGap, weeklyTrend, weeklyDelta,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Sheet builders ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function buildActionSheet(wb: ExcelJS.Workbook, dataSet: HandlerData[], isGroup: boolean, compareMap: CompareMap = null, compareDate: string | null = null): void {
  const ws = wb.addWorksheet("Today's Action Items");
  const extraCols = compareMap ? 4 : 0;
  const NC = (isGroup ? 8 : 7) + extraCols;

  const baseWidths = isGroup
    ? [22, 15, 28, 26, 17, 14, 12, 13]
    : [15, 28, 26, 17, 14, 12, 13];
  const widths = compareMap ? [...baseWidths, 28, 10, 14, 12] : baseWidths;
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

  const baseHeaders = isGroup
    ? ['Handler', 'Claim ID', 'Secondary Status', 'Cause', 'Total Incurred', 'Last Actioned', 'Priority', 'TAT']
    : ['Claim ID', 'Secondary Status', 'Cause', 'Total Incurred', 'Last Actioned', 'Priority', 'TAT'];
  const headers = compareMap
    ? [...baseHeaders, 'Prev Secondary Status', 'Status Changed?', 'Days (prev)', 'Δ Days']
    : baseHeaders;

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
            { v: lastActionedStr(item.daysInStatus), opts: { bg, fontColor: rowFont, h: 'center', border: borderArgb } },
            { v: item.priority.toUpperCase(),       opts: { bg, fontColor: rowFont, h: 'center', border: borderArgb } },
            { v: tatLabel(item.tatPosition),        opts: { bg: tatBg, fontColor: tatFg, bold: true, h: 'center', border: borderArgb } },
          ]
        : [
            { v: item.claimId,                     opts: { bg, fontColor: rowFont, bold: true,  border: borderArgb } },
            { v: item.secondaryStatus ?? '—',      opts: { bg, fontColor: rowFont,              border: borderArgb } },
            { v: item.cause ?? '—',                opts: { bg, fontColor: rowFont,              border: borderArgb } },
            { v: zarStr(item.totalIncurred),        opts: { bg, fontColor: currencyFont, bold: true, h: 'right', border: borderArgb } },
            { v: lastActionedStr(item.daysInStatus), opts: { bg, fontColor: rowFont, h: 'center', border: borderArgb } },
            { v: item.priority.toUpperCase(),       opts: { bg, fontColor: rowFont, h: 'center', border: borderArgb } },
            { v: tatLabel(item.tatPosition),        opts: { bg: tatBg, fontColor: tatFg, bold: true, h: 'center', border: borderArgb } },
          ];

      colData.forEach(({ v, opts }, ci) => sc(row.getCell(ci + 1), v, opts));

      // Append comparison columns
      if (compareMap) {
        const cSnap = compareMap.get(item.claimId);
        const baseCol = (isGroup ? 8 : 7) + 1;
        const prevStatus = cSnap ? (cSnap.secondaryStatus ?? 'New claim') : 'New claim';
        const changed = cSnap ? (cSnap.secondaryStatus !== item.secondaryStatus ? 'Yes' : 'No') : 'New claim';
        const prevDays = cSnap ? (cSnap.daysInCurrentStatus ?? 0) : null;
        const deltaDays = prevDays !== null ? (item.daysInStatus ?? 0) - prevDays : null;
        sc(row.getCell(baseCol),     prevStatus,                         { bg, fontColor: A.gray,  border: borderArgb });
        sc(row.getCell(baseCol + 1), changed,                            { bg: changed === 'Yes' ? A.lightGreen : bg, fontColor: changed === 'Yes' ? A.darkGreen : A.gray, h: 'center', border: borderArgb });
        sc(row.getCell(baseCol + 2), prevDays ?? '—',                    { bg, fontColor: A.gray, h: 'center', border: borderArgb });
        sc(row.getCell(baseCol + 3), deltaDays !== null ? deltaDays : '—', { bg: deltaDays !== null && deltaDays > 0 ? A.lightRed : deltaDays !== null && deltaDays < 0 ? A.lightGreen : bg, fontColor: A.darkGray, h: 'center', border: borderArgb });
      }
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

    // Ghost rows: claims in compareMap that are NOT in current portfolio (resolved)
    if (compareMap && compareDate) {
      const currentIds = new Set([
        ...d.actionItems.map(c => c.claimId),
        ...d.portfolioClaims.map(c => c.claimId),
        ...d.pendingFinalisation.map(c => c.claimId),
      ]);
      const resolvedEntries = [...compareMap.entries()].filter(([id]) => !currentIds.has(id));
      if (resolvedEntries.length > 0) {
        addSpacer(ws, NC, 6);
        addMergedRow(ws, `   ✓ Resolved since ${compareDate}  (${resolvedEntries.length})`, NC,
          { bg: A.lightGreen, fontColor: A.darkGreen, bold: true, size: 10 }, 20);
        resolvedEntries.forEach(([claimId, snap]) => {
          const row = ws.addRow([]);
          row.height = 18;
          for (let c = 1; c <= NC; c++) {
            row.getCell(c).fill = sf(A.lightGreen);
          }
          sc(row.getCell(1), claimId, { bg: A.lightGreen, fontColor: A.darkGreen, bold: true });
          sc(row.getCell(2), snap.secondaryStatus ?? '—', { bg: A.lightGreen, fontColor: A.darkGreen });
          sc(row.getCell(3), '✓ Resolved', { bg: A.lightGreen, fontColor: A.darkGreen, bold: true });
        });
      }
    }
  }
}

function buildAssessorAppointedSheet(wb: ExcelJS.Workbook, dataSet: HandlerData[], isGroup: boolean): void {
  const ws = wb.addWorksheet('Assessor Appointed');
  const NC = isGroup ? 6 : 5;
  const widths = isGroup
    ? [22, 15, 26, 14, 13, 15]
    : [15, 26, 14, 13, 15];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const sd = dataSet[0]?.snapshotDate;
  const totalCount = dataSet.reduce((s, d) => s + d.assessorAppointed.length, 0);
  const label = isGroup
    ? `Assessor Appointed  —  Group Report  (${dataSet.map(d => d.handler).join(', ')})`
    : `Assessor Appointed  —  ${dataSet[0]?.handler ?? ''}`;

  addMergedRow(ws, `   ${label}`, NC,
    { bg: A.teal, fontColor: A.white, bold: true, size: 14 }, 32);
  addMergedRow(ws,
    `   Generated: ${sd ? dateStr(sd) : '—'}  ·  ${totalCount} claim${totalCount !== 1 ? 's' : ''} with Assessor Appointed secondary status  ·  Overdue Days = days beyond TAT limit (highlighted red)`,
    NC, { bg: A.sectionBg, fontColor: A.gray, bold: false, size: 9, italic: true }, 14);
  addSpacer(ws, NC, 8);

  const headers = isGroup
    ? ['Handler', 'Claim ID', 'Cause', 'Days in Status', 'TAT Limit', 'Overdue Days']
    : ['Claim ID', 'Cause', 'Days in Status', 'TAT Limit', 'Overdue Days'];

  for (const d of dataSet) {
    if (isGroup) {
      addMergedRow(ws, `   Handler: ${d.handler}`, NC,
        { bg: A.charcoal, fontColor: A.white, bold: true, size: 11 }, 26);
      addSpacer(ws, NC, 4);
    }

    if (d.assessorAppointed.length === 0) {
      addMergedRow(ws, '   No claims with Assessor Appointed status.', NC,
        { bg: A.lightGreen, fontColor: A.darkGreen, bold: false, size: 10 }, 18);
      if (isGroup) addSpacer(ws, NC, 8);
      continue;
    }

    addHeaderRow(ws, headers, A.teal, A.white, 22);

    d.assessorAppointed.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? A.lightTeal : A.white;
      const isOverdue = item.overdueDays !== null && item.overdueDays > 0;
      const overdueBg = isOverdue ? A.lightRed : A.lightGreen;
      const overdueFg = isOverdue ? A.darkRed  : A.darkGreen;
      const overdueBorder = isOverdue ? A.redBorder : A.greenBorder;

      const row = ws.addRow([]);
      row.height = 19;

      const colData: Array<{ v: string | number | null; opts: CellOpts }> = isGroup
        ? [
            { v: item.handler ?? '—',      opts: { bg, fontColor: A.teal, bold: true,  border: A.tealBorder } },
            { v: item.claimId,              opts: { bg, fontColor: A.teal, bold: true,  border: A.tealBorder } },
            { v: item.cause ?? '—',         opts: { bg, fontColor: A.darkGray,          border: A.tealBorder } },
            { v: item.daysInStatus ?? '—',  opts: { bg, fontColor: A.darkGray, h: 'center', border: A.tealBorder } },
            { v: item.tatMaxDays ?? '—',    opts: { bg, fontColor: A.darkGray, h: 'center', border: A.tealBorder } },
            { v: isOverdue ? item.overdueDays! : '—', opts: { bg: overdueBg, fontColor: overdueFg, bold: isOverdue, h: 'center', border: overdueBorder } },
          ]
        : [
            { v: item.claimId,              opts: { bg, fontColor: A.teal, bold: true,  border: A.tealBorder } },
            { v: item.cause ?? '—',         opts: { bg, fontColor: A.darkGray,          border: A.tealBorder } },
            { v: item.daysInStatus ?? '—',  opts: { bg, fontColor: A.darkGray, h: 'center', border: A.tealBorder } },
            { v: item.tatMaxDays ?? '—',    opts: { bg, fontColor: A.darkGray, h: 'center', border: A.tealBorder } },
            { v: isOverdue ? item.overdueDays! : '—', opts: { bg: overdueBg, fontColor: overdueFg, bold: isOverdue, h: 'center', border: overdueBorder } },
          ];

      colData.forEach(({ v, opts }, ci) => sc(row.getCell(ci + 1), v, opts));
    });

    if (isGroup) addSpacer(ws, NC, 10);
  }

  if (totalCount === 0 && !isGroup) {
    addMergedRow(ws, '   No claims with Assessor Appointed status.', NC,
      { bg: A.lightGreen, fontColor: A.darkGreen, bold: false, size: 10 }, 20);
  }
}

function buildPortfolioSheet(wb: ExcelJS.Workbook, dataSet: HandlerData[], isGroup: boolean, compareMap: CompareMap = null, _compareDate: string | null = null): void {
  const ws = wb.addWorksheet('My Portfolio');
  const extraCols = compareMap ? 4 : 0;
  const NC = (isGroup ? 9 : 8) + extraCols;
  const baseWidths = isGroup
    ? [22, 15, 17, 28, 24, 7, 17, 17, 12]
    : [15, 17, 28, 24, 7, 17, 17, 12];
  const widths = compareMap ? [...baseWidths, 17, 17, 12, 14] : baseWidths;
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

  const baseHeaders = isGroup
    ? ['Handler', 'Claim ID', 'Status', 'Secondary Status', 'Cause', 'Days', 'Total Incurred', 'Outstanding', 'TAT']
    : ['Claim ID', 'Status', 'Secondary Status', 'Cause', 'Days', 'Total Incurred', 'Outstanding', 'TAT'];
  const headers = compareMap
    ? [...baseHeaders, 'Prev Outstanding', 'Δ Outstanding', 'Prev TAT', 'Status Change']
    : baseHeaders;

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

        // Portfolio comparison columns
        if (compareMap) {
          const cSnap = compareMap.get(claim.claimId);
          const baseCol = (isGroup ? 9 : 8) + 1;
          const prevOs = cSnap ? Number(cSnap.totalOs ?? 0) : null;
          const currOs = claim.totalOs ? Number(claim.totalOs) : 0;
          const deltaOs = prevOs !== null ? currOs - prevOs : null;
          const prevTat = cSnap ? (cSnap.isTatBreach ? 'BREACH' : 'OK') : 'New';
          // Determine status change direction
          let statusChange = '—';
          if (cSnap) {
            const prevPriority = cSnap.isTatBreach ? 'breach' : 'ok';
            const currPriority = claim.tatPosition === 'breach' ? 'breach' : 'ok';
            if (prevPriority === 'breach' && currPriority !== 'breach') statusChange = 'Improved';
            else if (prevPriority !== 'breach' && currPriority === 'breach') statusChange = 'Worsened';
            else statusChange = 'Unchanged';
          }
          sc(row.getCell(baseCol),     prevOs !== null ? zarStr(prevOs) : 'New claim', { bg, fontColor: A.gray, h: 'right', border: A.border });
          sc(row.getCell(baseCol + 1), deltaOs !== null ? (deltaOs > 0 ? `+${zarStr(deltaOs)}` : zarStr(deltaOs)) : '—', { bg: deltaOs !== null && deltaOs > 0 ? A.lightRed : deltaOs !== null && deltaOs < 0 ? A.lightGreen : bg, fontColor: A.darkGray, h: 'right', border: A.border });
          sc(row.getCell(baseCol + 2), prevTat, { bg: prevTat === 'BREACH' ? A.lightRed : bg, fontColor: prevTat === 'BREACH' ? A.darkRed : A.gray, h: 'center', border: A.border });
          sc(row.getCell(baseCol + 3), statusChange, { bg: statusChange === 'Improved' ? A.lightGreen : statusChange === 'Worsened' ? A.lightRed : bg, fontColor: statusChange === 'Improved' ? A.darkGreen : statusChange === 'Worsened' ? A.darkRed : A.gray, h: 'center', border: A.border });
        }
      });
    }

    if (isGroup) addSpacer(ws, NC, 10);
  }
}

function buildPendingFinalisationSheet(wb: ExcelJS.Workbook, dataSet: HandlerData[], isGroup: boolean): void {
  const ws = wb.addWorksheet('Pending Finalisation');
  const NC = isGroup ? 6 : 5;
  const widths = isGroup
    ? [22, 15, 28, 26, 17, 9]
    : [15, 28, 26, 17, 9];
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
    ? ['Handler', 'Claim ID', 'Secondary Status', 'Cause', 'Total Incurred', 'Days']
    : ['Claim ID', 'Secondary Status', 'Cause', 'Total Incurred', 'Days'];

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
          ]
        : [
            { v: item.claimId,                  opts: { bg, fontColor: A.darkPurple, bold: true, border: A.purpleBorder } },
            { v: item.secondaryStatus ?? '—',   opts: { bg, fontColor: A.darkPurple, border: A.purpleBorder } },
            { v: item.cause ?? '—',             opts: { bg, fontColor: A.darkPurple, border: A.purpleBorder } },
            { v: zarStr(item.totalIncurred),     opts: { bg, fontColor: A.darkPurple, bold: true, h: 'right', border: A.purpleBorder } },
            { v: item.daysInStatus ?? '—',      opts: { bg, fontColor: A.darkPurple, h: 'center', border: A.purpleBorder } },
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

function buildWeeklyDeltaSheet(wb: ExcelJS.Workbook, dataSet: HandlerData[], isGroup: boolean): void {
  const ws = wb.addWorksheet('Monthly Delta');
  const NC = 6;
  [21, 21, 21, 21, 21, 21].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const sd = dataSet[0]?.snapshotDate;
  const label = isGroup
    ? `Monthly Delta  —  Group Report  (${dataSet.map(d => d.handler).join(', ')})`
    : `Monthly Delta  —  ${dataSet[0]?.handler ?? ''}`;

  addMergedRow(ws, `   ${label}`, NC,
    { bg: A.navy, fontColor: A.white, bold: true, size: 14 }, 32);

  // ── Inner helpers ──
  function cardLabelRow(cards: Array<{ label: string; bg: string; fg: string }>): void {
    const row = ws.addRow([]);
    row.height = 18;
    cards.forEach((c, i) => {
      const col = i * 2 + 1;
      const cell = row.getCell(col);
      cell.value = c.label;
      cell.fill = sf(c.bg);
      cell.font = font(true, 8, c.fg) as ExcelJS.Font;
      cell.alignment = align('center', 'middle') as ExcelJS.Alignment;
      row.getCell(col + 1).fill = sf(c.bg);
      ws.mergeCells(row.number, col, row.number, col + 1);
    });
  }

  function cardValueRow(cards: Array<{ value: string; bg: string; fg: string; size?: number }>): void {
    const row = ws.addRow([]);
    row.height = 44;
    cards.forEach((c, i) => {
      const col = i * 2 + 1;
      const cell = row.getCell(col);
      cell.value = c.value;
      cell.fill = sf(c.bg);
      cell.font = font(true, c.size ?? 24, c.fg) as ExcelJS.Font;
      cell.alignment = align('center', 'middle') as ExcelJS.Alignment;
      cell.border = tb(A.border) as ExcelJS.Borders;
      row.getCell(col + 1).fill = sf(c.bg);
      row.getCell(col + 1).border = tb(A.border) as ExcelJS.Borders;
      ws.mergeCells(row.number, col, row.number, col + 1);
    });
  }

  function cardSubRow(subs: string[]): void {
    const row = ws.addRow([]);
    row.height = 15;
    subs.forEach((s, i) => {
      const col = i * 2 + 1;
      const cell = row.getCell(col);
      cell.value = s;
      cell.fill = sf(A.offWhite);
      cell.font = font(false, 8, A.gray, true) as ExcelJS.Font;
      cell.alignment = align('center', 'middle') as ExcelJS.Alignment;
      row.getCell(col + 1).fill = sf(A.offWhite);
      ws.mergeCells(row.number, col, row.number, col + 1);
    });
  }

  for (const d of dataSet) {
    const delta = d.weeklyDelta;
    const fromLabel = delta.weekStartDate
      ? `${dateStr(delta.weekStartDate)} → ${dateStr(d.snapshotDate)}`
      : `${dateStr(d.snapshotDate)}  (no prior snapshot found)`;

    addMergedRow(ws,
      `   Period: ${fromLabel}  ·  ${delta.periodDays}-day comparison`,
      NC, { bg: A.sectionBg, fontColor: A.gray, bold: false, size: 9, italic: true }, 14);

    if (isGroup) {
      addSpacer(ws, NC, 6);
      addMergedRow(ws, `   Handler: ${d.handler}`, NC,
        { bg: A.charcoal, fontColor: A.white, bold: true, size: 11 }, 26);
    }
    addSpacer(ws, NC, 8);

    // ── Row 1: New Claims | Finalised | Status Changes ──
    cardLabelRow([
      { label: 'NEW CLAIMS REGISTERED',  bg: A.navy,      fg: A.offWhite },
      { label: 'CLAIMS FINALISED',       bg: A.darkGreen, fg: A.white    },
      { label: 'STATUS CHANGES',         bg: A.teal,      fg: A.white    },
    ]);
    cardValueRow([
      { value: String(delta.newClaims),      bg: A.sectionBg,  fg: A.navy      },
      { value: String(delta.finalisedClaims), bg: A.lightGreen, fg: A.darkGreen },
      { value: String(delta.statusChanges),  bg: A.lightTeal,  fg: A.teal      },
    ]);
    cardSubRow([
      `new claims entered the portfolio`,
      `claims closed in the period`,
      `secondary status updates`,
    ]);

    addSpacer(ws, NC, 8);

    // ── Row 2: Avg Claims/Day | Avg Status Changes/Day | Open Portfolio ──
    const openDiff = delta.openClaimsLatest - delta.openClaimsWeekAgo;
    const openDiffStr = openDiff === 0 ? 'no change' : `${openDiff > 0 ? '+' : ''}${openDiff} vs last week`;
    cardLabelRow([
      { label: 'AVG NEW CLAIMS / DAY',       bg: A.blue,       fg: A.white },
      { label: 'AVG STATUS CHANGES / DAY',   bg: A.teal,       fg: A.white },
      { label: 'OPEN PORTFOLIO',             bg: A.charcoal,   fg: A.white },
    ]);
    cardValueRow([
      { value: String(delta.avgClaimsPerDay),         bg: A.sectionBg,   fg: A.navy,      size: 22 },
      { value: String(delta.avgStatusChangesPerDay),  bg: A.lightTeal,   fg: A.teal,      size: 22 },
      { value: String(delta.openClaimsLatest),        bg: A.offWhite,    fg: A.charcoal,  size: 22 },
    ]);
    cardSubRow([
      `over ${delta.periodDays}-day period`,
      `over ${delta.periodDays}-day period`,
      openDiffStr,
    ]);

    addSpacer(ws, NC, 8);

    // ── Row 3: Total OS Now | Total OS Week Ago | Value Change % ──
    const vcPct = delta.valueChangePct;
    const vcStr = vcPct === null ? '—' : `${vcPct >= 0 ? '+' : ''}${vcPct}%`;
    const vcBg  = vcPct === null ? A.offWhite : vcPct > 0 ? A.lightRed    : A.lightGreen;
    const vcFg  = vcPct === null ? A.gray     : vcPct > 0 ? A.darkRed     : A.darkGreen;
    const vcLabelBg = vcPct === null ? A.darkGray : vcPct > 0 ? A.red     : A.darkGreen;
    cardLabelRow([
      { label: 'TOTAL OUTSTANDING — NOW',       bg: A.navy,      fg: A.white },
      { label: 'TOTAL OUTSTANDING — WEEK AGO',  bg: A.darkGray,  fg: A.white },
      { label: 'PORTFOLIO VALUE CHANGE',        bg: vcLabelBg,   fg: A.white },
    ]);
    cardValueRow([
      { value: zarStr(delta.totalOsLatest),  bg: A.sectionBg, fg: A.navy,  size: 16 },
      { value: zarStr(delta.totalOsWeekAgo), bg: A.offWhite,  fg: A.gray,  size: 16 },
      { value: vcStr,                        bg: vcBg,        fg: vcFg,    size: 22 },
    ]);
    cardSubRow([
      `current open portfolio value`,
      `open portfolio ${delta.periodDays} days ago`,
      vcPct === null ? 'no comparison data' : vcPct > 0 ? 'outstanding increased' : 'outstanding decreased',
    ]);

    addSpacer(ws, NC, isGroup ? 16 : 10);
  }
}

type CompareMap = Map<string, { secondaryStatus: string | null; daysInCurrentStatus: number | null; totalOs: unknown; isTatBreach: boolean }> | null;

function buildWorkbook(dataSet: HandlerData[], isGroup: boolean, compareMap: CompareMap = null, compareDate: string | null = null): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SEB Hub';
  wb.created = new Date();
  wb.modified = new Date();

  buildWeeklyDeltaSheet(wb, dataSet, isGroup);
  buildActionSheet(wb, dataSet, isGroup, compareMap, compareDate);
  buildAssessorAppointedSheet(wb, dataSet, isGroup);
  buildPortfolioSheet(wb, dataSet, isGroup, compareMap, compareDate);
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
      compareDate?: string;
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

    // Fetch comparison snapshots if compareDate provided
    let compareMap: Map<string, { secondaryStatus: string | null; daysInCurrentStatus: number | null; totalOs: unknown; isTatBreach: boolean }> | null = null;
    let compareSnapshotDate: string | null = null;
    if (body.compareDate) {
      compareSnapshotDate = body.compareDate;
      const compareDate = new Date(body.compareDate);
      const claimIds = dataSet.flatMap(d => [
        ...d.actionItems.map(c => c.claimId),
        ...d.portfolioClaims.map(c => c.claimId),
        ...d.pendingFinalisation.map(c => c.claimId),
      ]);
      if (claimIds.length > 0) {
        const compareSnaps = await prisma.claimSnapshot.findMany({
          where: { snapshotDate: compareDate, claimId: { in: claimIds } },
          select: { claimId: true, secondaryStatus: true, daysInCurrentStatus: true, totalOs: true, isTatBreach: true },
        });
        compareMap = new Map(compareSnaps.map(s => [s.claimId, s]));
      } else {
        compareMap = new Map();
      }
    }

    const wb = buildWorkbook(dataSet, reportType === 'group', compareMap, compareSnapshotDate);
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
