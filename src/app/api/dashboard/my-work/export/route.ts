import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import * as XLSX from 'xlsx';

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  navy:        '0D2761',
  blue:        '1E5BC6',
  white:       'FFFFFF',
  offWhite:    'F8FAFF',
  border:      'E8EEF8',
  gray:        '6B7280',
  dark:        '374151',
  red:         'DC2626',
  darkRed:     '7F1D1D',
  lightRed:    'FEE2E2',
  redBorder:   'FCA5A5',
  darkAmber:   '92400E',
  lightAmber:  'FEF3C7',
  amberBorder: 'FDE68A',
  darkGreen:   '166534',
  lightGreen:  'DCFCE7',
  purple:      '7C3AED',
  darkPurple:  '4C1D95',
  lightPurple: 'EDE9FE',
  purpleBorder:'C4B5FD',
  sectionBg:   'EEF2FF',
  amber:       'F5A800',
  teal:        '0D9488',
  lightTeal:   'CCFBF1',
  tealBorder:  '99F6E4',
};

// ── Style helpers ─────────────────────────────────────────────────────────────
type Sty = Record<string, unknown>;

const f = (o: Record<string, unknown>): Record<string, unknown> => ({ name: 'Calibri', sz: 10, ...o });
const fl = (rgb: string): Record<string, unknown> => ({ type: 'pattern', patternType: 'solid', fgColor: { rgb } });
const bd = (rgb = C.border): Record<string, unknown> => {
  const b = { style: 'thin', color: { rgb } };
  return { top: b, bottom: b, left: b, right: b };
};
const al = (horizontal = 'left', wrapText = false): Record<string, unknown> => ({
  horizontal, vertical: 'center', wrapText,
});

const ST: Record<string, Sty> = {
  titleNavy:   { font: f({ bold: true, sz: 14, color: { rgb: C.white } }), fill: fl(C.navy),   alignment: al('left') },
  titlePurple: { font: f({ bold: true, sz: 14, color: { rgb: C.white } }), fill: fl(C.purple), alignment: al('left') },
  titleTeal:   { font: f({ bold: true, sz: 14, color: { rgb: C.white } }), fill: fl(C.teal),   alignment: al('left') },
  subtitle:    { font: f({ italic: true, sz: 9, color: { rgb: C.gray } }), fill: fl(C.offWhite), alignment: al('left') },

  colHeader:      { font: f({ bold: true, color: { rgb: C.white } }),       fill: fl(C.blue),   alignment: al('center'), border: bd() },
  purpleHeader:   { font: f({ bold: true, color: { rgb: C.white } }),       fill: fl(C.purple), alignment: al('center'), border: bd() },
  tealHeader:     { font: f({ bold: true, color: { rgb: C.white } }),       fill: fl(C.teal),   alignment: al('center'), border: bd() },

  sectionCritical:{ font: f({ bold: true, sz: 11, color: { rgb: C.white } }),   fill: fl(C.red),    alignment: al('left') },
  sectionUrgent:  { font: f({ bold: true, sz: 11, color: { rgb: C.white } }),   fill: fl('B45309'), alignment: al('left') },
  sectionStd:     { font: f({ bold: true, sz: 11, color: { rgb: C.white } }),   fill: fl(C.blue),   alignment: al('left') },
  sectionDivider: { font: f({ bold: true, sz: 10, color: { rgb: C.white } }),   fill: fl('374151'), alignment: al('left') },

  critical:       { font: f({ color: { rgb: C.darkRed } }),        fill: fl(C.lightRed),   border: bd(C.redBorder),   alignment: al() },
  criticalBold:   { font: f({ bold: true, color: { rgb: C.darkRed } }), fill: fl(C.lightRed), border: bd(C.redBorder), alignment: al() },
  critCurrency:   { font: f({ bold: true, color: { rgb: C.darkRed } }), fill: fl(C.lightRed), border: bd(C.redBorder), alignment: al('right') },

  urgent:         { font: f({ color: { rgb: C.darkAmber } }),      fill: fl(C.lightAmber), border: bd(C.amberBorder), alignment: al() },
  urgentBold:     { font: f({ bold: true, color: { rgb: C.darkAmber } }), fill: fl(C.lightAmber), border: bd(C.amberBorder), alignment: al() },
  urgCurrency:    { font: f({ bold: true, color: { rgb: C.darkAmber } }), fill: fl(C.lightAmber), border: bd(C.amberBorder), alignment: al('right') },

  std:            { font: f({ color: { rgb: C.dark } }),            fill: fl(C.white),    border: bd(), alignment: al() },
  stdBold:        { font: f({ bold: true, color: { rgb: C.navy } }),fill: fl(C.white),    border: bd(), alignment: al() },
  stdCurrency:    { font: f({ bold: true, color: { rgb: C.navy } }),fill: fl(C.white),    border: bd(), alignment: al('right') },

  alt:            { font: f({ color: { rgb: C.dark } }),            fill: fl(C.offWhite), border: bd(), alignment: al() },
  altBold:        { font: f({ bold: true, color: { rgb: C.navy } }),fill: fl(C.offWhite), border: bd(), alignment: al() },
  altCurrency:    { font: f({ bold: true, color: { rgb: C.navy } }),fill: fl(C.offWhite), border: bd(), alignment: al('right') },

  breach:         { font: f({ bold: true, color: { rgb: C.darkRed } }),   fill: fl(C.lightRed),   border: bd(), alignment: al('center') },
  atRisk:         { font: f({ bold: true, color: { rgb: C.darkAmber } }), fill: fl(C.lightAmber), border: bd(), alignment: al('center') },
  onTrack:        { font: f({ bold: true, color: { rgb: C.darkGreen } }), fill: fl(C.lightGreen), border: bd(), alignment: al('center') },

  kpiLabel:       { font: f({ sz: 8, color: { rgb: C.gray } }),          fill: fl(C.offWhite), alignment: al('center') },
  kpiValue:       { font: f({ bold: true, sz: 18, color: { rgb: C.navy } }),     fill: fl(C.offWhite), alignment: { horizontal: 'center', vertical: 'center' } },
  kpiGood:        { font: f({ bold: true, sz: 18, color: { rgb: C.darkGreen } }), fill: fl(C.lightGreen), alignment: { horizontal: 'center', vertical: 'center' } },
  kpiBad:         { font: f({ bold: true, sz: 18, color: { rgb: C.darkRed } }),   fill: fl(C.lightRed),   alignment: { horizontal: 'center', vertical: 'center' } },
  kpiSub:         { font: f({ sz: 8, italic: true, color: { rgb: C.gray } }),     fill: fl(C.offWhite), alignment: al('center') },

  statLabel:      { font: f({ sz: 9, color: { rgb: C.white } }),          fill: fl(C.navy), border: bd(C.blue),  alignment: al('center') },
  statValue:      { font: f({ bold: true, sz: 14, color: { rgb: C.white } }), fill: fl(C.blue), border: bd(C.navy), alignment: al('center') },
  statValueBad:   { font: f({ bold: true, sz: 14, color: { rgb: C.white } }), fill: fl(C.red),  border: bd(C.navy), alignment: al('center') },
  statValueAmber: { font: f({ bold: true, sz: 14, color: { rgb: C.white } }), fill: fl(C.amber), border: bd(C.navy), alignment: al('center') },

  settRow:        { font: f({ color: { rgb: C.darkPurple } }),           fill: fl(C.lightPurple), border: bd(C.purpleBorder), alignment: al() },
  settBold:       { font: f({ bold: true, color: { rgb: C.darkPurple } }), fill: fl(C.lightPurple), border: bd(C.purpleBorder), alignment: al() },
  settCurrency:   { font: f({ bold: true, color: { rgb: C.darkPurple } }), fill: fl(C.lightPurple), border: bd(C.purpleBorder), alignment: al('right') },
  settBadge:      { font: f({ bold: true, color: { rgb: C.darkPurple } }), fill: fl(C.lightPurple), border: bd(C.purpleBorder), alignment: al('center') },

  coachBox:       { font: f({ italic: true, sz: 9, color: { rgb: C.navy } }), fill: fl(C.sectionBg), alignment: { horizontal: 'left', vertical: 'center', wrapText: true } },
  empty:          { fill: fl(C.white), alignment: al() },
  emptySect:      { fill: fl(C.offWhite), alignment: al() },
};

// ── Worksheet helpers ─────────────────────────────────────────────────────────
function wc(ws: XLSX.WorkSheet, r: number, c: number, v: string | number | null | undefined, sty: Sty): void {
  const addr = XLSX.utils.encode_cell({ r, c });
  const val = v ?? '—';
  (ws[addr] as XLSX.CellObject) = { v: val, t: typeof val === 'number' ? 'n' : 's', s: sty };
}

function mc(ws: XLSX.WorkSheet, r1: number, c1: number, r2: number, c2: number): void {
  if (!ws['!merges']) ws['!merges'] = [];
  (ws['!merges'] as XLSX.Range[]).push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
}

function rh(ws: XLSX.WorkSheet, r: number, hpt: number): void {
  if (!ws['!rows']) ws['!rows'] = [];
  const rows = ws['!rows'] as ({ hpt?: number } | null | undefined)[];
  while (rows.length <= r) rows.push(null);
  rows[r] = { hpt };
}

function setRef(ws: XLSX.WorkSheet, maxR: number, maxC: number): void {
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, maxR), c: Math.max(0, maxC) } });
}

function mergedRow(ws: XLSX.WorkSheet, row: number, text: string, ncols: number, sty: Sty, height = 28): void {
  for (let c = 0; c < ncols; c++) wc(ws, row, c, c === 0 ? text : '', sty);
  mc(ws, row, 0, row, ncols - 1);
  rh(ws, row, height);
}

function emptyRow(ws: XLSX.WorkSheet, row: number, ncols: number, sty: Sty = ST.empty, height = 8): void {
  for (let c = 0; c < ncols; c++) wc(ws, row, c, '', sty);
  rh(ws, row, height);
}

// ── Formatters ────────────────────────────────────────────────────────────────
function zarStr(v: number | null): string {
  if (v === null) return '—';
  return 'R\u00a0' + v.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function dateStr(d: Date): string {
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
}

function tatSty(pos: string): Sty {
  if (pos === 'breach') return ST.breach;
  if (pos === 'at-risk') return ST.atRisk;
  return ST.onTrack;
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
  pendingSettlement: ActionItem[];
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
    { key: 'speed',        val: speed,        note: 'Focus on issuing first payments earlier to improve response speed.' },
    { key: 'quality',      val: quality,       note: 'Reduce claim reopening by ensuring thorough assessment before closure.' },
    { key: 'coverage',     val: coverage,      note: 'Address TAT breaches by prioritising claims approaching their deadline.' },
    { key: 'finalisation', val: finalisation,  note: 'Work to reduce the average time to close claims in your portfolio.' },
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
function isPendingSettlement(claimStatus: string | null, secondaryStatus: string | null): boolean {
  const st = (claimStatus ?? '').toLowerCase();
  const ss = (secondaryStatus ?? '').toLowerCase();
  return st.includes('processing') && ss.includes('claim settled');
}

async function fetchHandlerData(handler: string, snapshotDate: Date): Promise<HandlerData> {
  const hw = { handler };
  const excl = { notIn: ['Finalised', 'Cancelled', 'Repudiated'] };

  // ── Action items ──
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

  const pendingSettlement = allItems.filter(i => isPendingSettlement(i.claimStatus, i.secondaryStatus));
  const actionItems = allItems.filter(i => !isPendingSettlement(i.claimStatus, i.secondaryStatus));

  // ── Portfolio ──
  const portWhere = { snapshotDate, claimStatus: excl, ...hw };
  const [openCount, agg, tatBreachCount, portClaims] = await Promise.all([
    prisma.claimSnapshot.count({ where: portWhere }),
    prisma.claimSnapshot.aggregate({ where: portWhere, _sum: { totalOs: true } }),
    prisma.claimSnapshot.count({ where: { ...portWhere, isTatBreach: true } }),
    prisma.claimSnapshot.findMany({
      where: portWhere,
      take: 150,
      orderBy: { totalOs: 'desc' },
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
  const activeDelaysCount = await (portClaimIds.length > 0
    ? prisma.acknowledgedDelay.count({ where: { claimId: { in: portClaimIds }, isActive: true } })
    : Promise.resolve(0));

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

  // ── CS Score ──
  const csScore = await computeCsScore(handler, snapshotDate);

  // ── TAT breach by status ──
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

  // ── Notification gap ──
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
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const notificationGap = {
    avg: hGap._avg.notificationGapDays ? round1(Number(hGap._avg.notificationGapDays)) : null,
    teamAvg: allGap._avg.notificationGapDays ? round1(Number(allGap._avg.notificationGapDays)) : null,
  };

  // ── Weekly trend (last 12 snapshots) ──
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
      const sc = await computeCsScore(handler, wsd);
      return { week: wsd.toISOString().split('T')[0], csScore: sc?.total ?? null };
    }),
  );

  return {
    handler,
    snapshotDate,
    actionItems,
    pendingSettlement,
    portfolioStats: {
      openClaims: openCount,
      totalOutstanding: agg._sum.totalOs ? Number(agg._sum.totalOs) : 0,
      tatBreaches: tatBreachCount,
      activeDelays: activeDelaysCount,
    },
    portfolioClaims,
    csScore,
    tatBreaches,
    notificationGap,
    weeklyTrend,
  };
}

// ── Sheet builders ────────────────────────────────────────────────────────────

function buildActionSheet(dataSet: HandlerData[], isGroup: boolean): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const NC = isGroup ? 8 : 7; // columns
  const colW = isGroup
    ? [22, 14, 26, 24, 16, 8, 12, 12]
    : [14, 26, 24, 16, 8, 12, 12];
  ws['!cols'] = colW.map(w => ({ wch: w }));
  let r = 0;

  const label = isGroup
    ? `Group Report — Today's Action Items — ${dataSet.map(d => d.handler).join(', ')}`
    : `Today's Action Items — ${dataSet[0]?.handler ?? ''}`;
  const sd = dataSet[0]?.snapshotDate;

  mergedRow(ws, r++, label, NC, ST.titleNavy, 30);
  mergedRow(ws, r++, `Generated: ${sd ? dateStr(sd) : '—'} · Claims pending settlement are excluded from this view`, NC, ST.subtitle, 14);
  emptyRow(ws, r++, NC, ST.empty, 6);

  const headers = isGroup
    ? ['Handler', 'Claim ID', 'Secondary Status', 'Cause', 'Total Incurred', 'Days', 'Priority', 'TAT']
    : ['Claim ID', 'Secondary Status', 'Cause', 'Total Incurred', 'Days', 'Priority', 'TAT'];

  function writeSection(
    sectionLabel: string,
    items: ActionItem[],
    secSty: Sty,
    rowSty: Sty,
    boldSty: Sty,
    currSty: Sty,
  ) {
    if (items.length === 0) return;
    mergedRow(ws, r, `  ${sectionLabel}  (${items.length})`, NC, secSty, 20);
    r++;
    headers.forEach((h, c) => { wc(ws, r, c, h, ST.colHeader); });
    rh(ws, r, 20); r++;

    items.forEach((item, idx) => {
      const isAlt = idx % 2 === 1;
      const rSty = isAlt ? (rowSty === ST.std ? ST.alt : rowSty) : rowSty;
      const bSty = isAlt ? (boldSty === ST.stdBold ? ST.altBold : boldSty) : boldSty;
      const cSty = isAlt ? (currSty === ST.stdCurrency ? ST.altCurrency : currSty) : currSty;
      const tSty = tatSty(item.tatPosition);
      const tLbl = tatLabel(item.tatPosition);

      if (isGroup) {
        wc(ws, r, 0, item.handler ?? '—', bSty);
        wc(ws, r, 1, item.claimId, bSty);
        wc(ws, r, 2, item.secondaryStatus ?? '—', rSty);
        wc(ws, r, 3, item.cause ?? '—', rSty);
        wc(ws, r, 4, zarStr(item.totalIncurred), cSty);
        wc(ws, r, 5, item.daysInStatus ?? '—', rSty);
        wc(ws, r, 6, item.priority.toUpperCase(), rSty);
        wc(ws, r, 7, tLbl, tSty);
      } else {
        wc(ws, r, 0, item.claimId, bSty);
        wc(ws, r, 1, item.secondaryStatus ?? '—', rSty);
        wc(ws, r, 2, item.cause ?? '—', rSty);
        wc(ws, r, 3, zarStr(item.totalIncurred), cSty);
        wc(ws, r, 4, item.daysInStatus ?? '—', rSty);
        wc(ws, r, 5, item.priority.toUpperCase(), rSty);
        wc(ws, r, 6, tLbl, tSty);
      }
      rh(ws, r, 18); r++;
    });
    emptyRow(ws, r++, NC, ST.empty, 6);
  }

  if (isGroup) {
    // Group: write per-handler sections
    for (const d of dataSet) {
      mergedRow(ws, r, `  Handler: ${d.handler}`, NC, ST.sectionDivider, 24);
      r++;
      const critical = d.actionItems.filter(i => i.priority === 'critical');
      const urgent   = d.actionItems.filter(i => i.priority === 'urgent');
      const standard = d.actionItems.filter(i => i.priority === 'standard');
      writeSection('⚡  CRITICAL ACTION', critical, ST.sectionCritical, ST.critical, ST.criticalBold, ST.critCurrency);
      writeSection('⚠  URGENT',          urgent,   ST.sectionUrgent,   ST.urgent,   ST.urgentBold,   ST.urgCurrency);
      writeSection('✓  STANDARD',        standard, ST.sectionStd,      ST.std,      ST.stdBold,      ST.stdCurrency);
      if (d.actionItems.length === 0) {
        mergedRow(ws, r++, '    All clear — no priority actions today.', NC, ST.subtitle, 16);
      }
      emptyRow(ws, r++, NC, ST.empty, 10);
    }
  } else {
    const d = dataSet[0];
    if (!d) return ws;
    const critical = d.actionItems.filter(i => i.priority === 'critical');
    const urgent   = d.actionItems.filter(i => i.priority === 'urgent');
    const standard = d.actionItems.filter(i => i.priority === 'standard');
    writeSection('⚡  CRITICAL ACTION', critical, ST.sectionCritical, ST.critical, ST.criticalBold, ST.critCurrency);
    writeSection('⚠  URGENT',          urgent,   ST.sectionUrgent,   ST.urgent,   ST.urgentBold,   ST.urgCurrency);
    writeSection('✓  STANDARD',        standard, ST.sectionStd,      ST.std,      ST.stdBold,      ST.stdCurrency);
    if (d.actionItems.length === 0) {
      mergedRow(ws, r++, '    All clear — no priority actions today.', NC, ST.subtitle, 16);
    }
  }

  setRef(ws, r - 1, NC - 1);
  return ws;
}

function buildCsTatSheet(dataSet: HandlerData[], isGroup: boolean): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const NC = 8;
  ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  let r = 0;

  const label = isGroup
    ? `Group Report — CS & TAT Health — ${dataSet.map(d => d.handler).join(', ')}`
    : `CS & TAT Health — ${dataSet[0]?.handler ?? ''}`;
  const sd = dataSet[0]?.snapshotDate;

  mergedRow(ws, r++, label, NC, ST.titleTeal, 30);
  mergedRow(ws, r++, `Generated: ${sd ? dateStr(sd) : '—'} · CS Score is out of 100 (4 components × 25 points each)`, NC, ST.subtitle, 14);

  for (const d of dataSet) {
    emptyRow(ws, r++, NC, ST.empty, 10);

    if (isGroup) {
      mergedRow(ws, r++, `  Handler: ${d.handler}`, NC, ST.sectionDivider, 24);
    }

    // ── CS Score KPI block ──
    const cs = d.csScore;
    const trendDiff = cs?.lastMonth !== null && cs?.lastMonth !== undefined ? (cs.total - cs.lastMonth) : null;

    // Labels row
    wc(ws, r, 0, 'CS SCORE', ST.kpiLabel);
    mc(ws, r, 0, r, 1);
    wc(ws, r, 2, 'SPEED', ST.kpiLabel);
    mc(ws, r, 2, r, 3);
    wc(ws, r, 4, 'QUALITY', ST.kpiLabel);
    mc(ws, r, 4, r, 5);
    wc(ws, r, 6, 'COVERAGE', ST.kpiLabel);
    mc(ws, r, 6, r, 7);
    rh(ws, r++, 14);

    // Values row
    const totalScore = cs?.total ?? null;
    const totalSty = totalScore !== null ? (totalScore >= 70 ? ST.kpiGood : totalScore >= 50 ? ST.kpiValue : ST.kpiBad) : ST.kpiValue;
    wc(ws, r, 0, totalScore !== null ? `${totalScore}/100` : '—', totalSty);
    mc(ws, r, 0, r, 1);
    wc(ws, r, 2, cs ? `${cs.speed}/25` : '—', ST.kpiValue);
    mc(ws, r, 2, r, 3);
    wc(ws, r, 4, cs ? `${cs.quality}/25` : '—', ST.kpiValue);
    mc(ws, r, 4, r, 5);
    wc(ws, r, 6, cs ? `${cs.coverage}/25` : '—', ST.kpiValue);
    mc(ws, r, 6, r, 7);
    rh(ws, r++, 32);

    // Sub labels row (trend + finalisation)
    wc(ws, r, 0, trendDiff !== null ? `${trendDiff >= 0 ? '+' : ''}${trendDiff} vs last month` : 'No prior data', ST.kpiSub);
    mc(ws, r, 0, r, 1);
    wc(ws, r, 2, 'Days to first payment', ST.kpiSub);
    mc(ws, r, 2, r, 3);
    wc(ws, r, 4, 'Reopen rate impact', ST.kpiSub);
    mc(ws, r, 4, r, 5);
    wc(ws, r, 6, 'TAT compliance', ST.kpiSub);
    mc(ws, r, 6, r, 7);
    rh(ws, r++, 13);

    // Finalisation KPI
    wc(ws, r, 0, 'FINALISATION', ST.kpiLabel);
    mc(ws, r, 0, r, 1);
    wc(ws, r, 2, 'NOTIFICATION GAP', ST.kpiLabel);
    mc(ws, r, 2, r, 3);
    wc(ws, r, 4, 'TEAM NOTIFICATION AVG', ST.kpiLabel);
    mc(ws, r, 4, r, 5);
    for (let c = 6; c < NC; c++) wc(ws, r, c, '', ST.kpiLabel);
    rh(ws, r++, 14);

    const notifHigher = d.notificationGap.avg !== null && d.notificationGap.teamAvg !== null
      && d.notificationGap.avg > d.notificationGap.teamAvg;
    wc(ws, r, 0, cs ? `${cs.finalisation}/25` : '—', ST.kpiValue);
    mc(ws, r, 0, r, 1);
    wc(ws, r, 2, d.notificationGap.avg !== null ? `${d.notificationGap.avg} days` : '—',
      notifHigher ? ST.kpiBad : ST.kpiValue);
    mc(ws, r, 2, r, 3);
    wc(ws, r, 4, d.notificationGap.teamAvg !== null ? `${d.notificationGap.teamAvg} days` : '—', ST.kpiValue);
    mc(ws, r, 4, r, 5);
    for (let c = 6; c < NC; c++) wc(ws, r, c, '', ST.kpiValue);
    rh(ws, r++, 32);

    wc(ws, r, 0, 'Avg days to finalise claims', ST.kpiSub);
    mc(ws, r, 0, r, 1);
    wc(ws, r, 2, notifHigher ? 'Above team average — review notification timing' : 'At or below team average', ST.kpiSub);
    mc(ws, r, 2, r, 3);
    wc(ws, r, 4, 'Benchmark for notification speed', ST.kpiSub);
    mc(ws, r, 4, r, 5);
    for (let c = 6; c < NC; c++) wc(ws, r, c, '', ST.kpiSub);
    rh(ws, r++, 13);

    // ── Coaching note ──
    if (cs?.coachingNote) {
      emptyRow(ws, r++, NC, ST.emptySect, 4);
      mergedRow(ws, r++, `  COACHING NOTE: ${cs.coachingNote}`, NC, ST.coachBox, 30);
    }

    // ── TAT Breach Analysis ──
    emptyRow(ws, r++, NC, ST.empty, 10);
    mergedRow(ws, r++, '  TAT BREACH ANALYSIS', NC, ST.titleTeal, 22);
    ['Secondary Status', 'Breach Count'].forEach((h, c) => wc(ws, r, c, h, ST.tealHeader));
    for (let c = 2; c < NC; c++) wc(ws, r, c, '', ST.tealHeader);
    rh(ws, r++, 20);

    if (d.tatBreaches.length === 0) {
      mergedRow(ws, r++, '    No TAT breaches recorded.', NC, ST.subtitle, 16);
    } else {
      d.tatBreaches.forEach((b, idx) => {
        const sty = idx % 2 === 0 ? ST.std : ST.alt;
        const bSty = idx % 2 === 0 ? ST.stdBold : ST.altBold;
        wc(ws, r, 0, b.secondaryStatus, bSty);
        wc(ws, r, 1, b.count, idx % 2 === 0 ? ST.breach : ST.breach);
        for (let c = 2; c < NC; c++) wc(ws, r, c, '', sty);
        rh(ws, r++, 18);
      });
    }

    // ── Weekly CS Trend ──
    emptyRow(ws, r++, NC, ST.empty, 10);
    mergedRow(ws, r++, '  12-WEEK CS SCORE TREND', NC, ST.titleTeal, 22);
    ['Week', 'CS Score'].forEach((h, c) => wc(ws, r, c, h, ST.tealHeader));
    for (let c = 2; c < NC; c++) wc(ws, r, c, '', ST.tealHeader);
    rh(ws, r++, 20);

    if (d.weeklyTrend.length === 0) {
      mergedRow(ws, r++, '    No trend data available.', NC, ST.subtitle, 16);
    } else {
      d.weeklyTrend.forEach((pt, idx) => {
        const sty = idx % 2 === 0 ? ST.std : ST.alt;
        const score = pt.csScore;
        const scoreSty = score !== null
          ? (score >= 70 ? ST.onTrack : score >= 50 ? ST.atRisk : ST.breach)
          : ST.std;
        wc(ws, r, 0, pt.week, sty);
        wc(ws, r, 1, score !== null ? score : '—', scoreSty);
        for (let c = 2; c < NC; c++) wc(ws, r, c, '', sty);
        rh(ws, r++, 18);
      });
    }
  }

  setRef(ws, r - 1, NC - 1);
  return ws;
}

function buildPortfolioSheet(dataSet: HandlerData[], isGroup: boolean): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const NC = isGroup ? 9 : 8;
  const colW = isGroup
    ? [22, 14, 16, 26, 22, 8, 16, 16, 12]
    : [14, 16, 26, 22, 8, 16, 16, 12];
  ws['!cols'] = colW.map(w => ({ wch: w }));
  let r = 0;

  const label = isGroup
    ? `Group Report — My Portfolio — ${dataSet.map(d => d.handler).join(', ')}`
    : `My Portfolio — ${dataSet[0]?.handler ?? ''}`;
  const sd = dataSet[0]?.snapshotDate;

  mergedRow(ws, r++, label, NC, ST.titleNavy, 30);
  mergedRow(ws, r++, `Generated: ${sd ? dateStr(sd) : '—'} · Showing up to 150 claims per handler, ordered by outstanding amount`, NC, ST.subtitle, 14);
  emptyRow(ws, r++, NC, ST.empty, 6);

  const headers = isGroup
    ? ['Handler', 'Claim ID', 'Status', 'Secondary Status', 'Cause', 'Days Open', 'Total Incurred', 'Outstanding', 'TAT']
    : ['Claim ID', 'Status', 'Secondary Status', 'Cause', 'Days Open', 'Total Incurred', 'Outstanding', 'TAT'];

  for (const d of dataSet) {
    if (isGroup) {
      mergedRow(ws, r++, `  Handler: ${d.handler}`, NC, ST.sectionDivider, 24);
    }

    // Stats block
    const stats = d.portfolioStats;
    const statCols = ['Open Claims', 'Total Outstanding', 'TAT Breaches', 'Active Delays'];
    statCols.forEach((lbl, c) => wc(ws, r, c, lbl, ST.statLabel));
    for (let c = 4; c < NC; c++) wc(ws, r, c, '', ST.empty);
    rh(ws, r++, 16);

    const statVals = [
      { v: stats.openClaims, sty: ST.statValue },
      { v: zarStr(stats.totalOutstanding), sty: ST.statValue },
      { v: stats.tatBreaches, sty: stats.tatBreaches > 0 ? ST.statValueBad : ST.statValue },
      { v: stats.activeDelays, sty: stats.activeDelays > 0 ? ST.statValueAmber : ST.statValue },
    ];
    statVals.forEach(({ v, sty }, c) => wc(ws, r, c, v, sty));
    for (let c = 4; c < NC; c++) wc(ws, r, c, '', ST.empty);
    rh(ws, r++, 24);

    emptyRow(ws, r++, NC, ST.empty, 8);

    // Headers
    headers.forEach((h, c) => wc(ws, r, c, h, ST.colHeader));
    rh(ws, r++, 20);

    if (d.portfolioClaims.length === 0) {
      mergedRow(ws, r++, '    No claims in portfolio.', NC, ST.subtitle, 16);
    } else {
      d.portfolioClaims.forEach((claim, idx) => {
        const isAlt = idx % 2 === 1;
        const rSty = isAlt ? ST.alt : ST.std;
        const bSty = isAlt ? ST.altBold : ST.stdBold;
        const cSty = isAlt ? ST.altCurrency : ST.stdCurrency;
        const tSty = tatSty(claim.tatPosition);
        const tLbl = tatLabel(claim.tatPosition);

        if (isGroup) {
          wc(ws, r, 0, claim.handler ?? '—', bSty);
          wc(ws, r, 1, claim.claimId, bSty);
          wc(ws, r, 2, claim.claimStatus ?? '—', rSty);
          wc(ws, r, 3, claim.secondaryStatus ?? '—', rSty);
          wc(ws, r, 4, claim.cause ?? '—', rSty);
          wc(ws, r, 5, claim.daysOpen ?? '—', rSty);
          wc(ws, r, 6, zarStr(claim.totalIncurred), cSty);
          wc(ws, r, 7, zarStr(claim.totalOs), cSty);
          wc(ws, r, 8, tLbl, tSty);
        } else {
          wc(ws, r, 0, claim.claimId, bSty);
          wc(ws, r, 1, claim.claimStatus ?? '—', rSty);
          wc(ws, r, 2, claim.secondaryStatus ?? '—', rSty);
          wc(ws, r, 3, claim.cause ?? '—', rSty);
          wc(ws, r, 4, claim.daysOpen ?? '—', rSty);
          wc(ws, r, 5, zarStr(claim.totalIncurred), cSty);
          wc(ws, r, 6, zarStr(claim.totalOs), cSty);
          wc(ws, r, 7, tLbl, tSty);
        }
        rh(ws, r++, 18);
      });
    }

    if (isGroup) emptyRow(ws, r++, NC, ST.empty, 12);
  }

  setRef(ws, r - 1, NC - 1);
  return ws;
}

function buildPendingSheet(dataSet: HandlerData[], isGroup: boolean): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const NC = isGroup ? 7 : 6;
  const colW = isGroup
    ? [22, 14, 26, 24, 16, 8, 12]
    : [14, 26, 24, 16, 8, 12];
  ws['!cols'] = colW.map(w => ({ wch: w }));
  let r = 0;

  const sd = dataSet[0]?.snapshotDate;
  const totalCount = dataSet.reduce((s, d) => s + d.pendingSettlement.length, 0);

  mergedRow(ws, r++, `Pending Settlement — Claims in Processing`, NC, ST.titlePurple, 30);
  mergedRow(ws, r++, `Generated: ${sd ? dateStr(sd) : '—'} · ${totalCount} claim${totalCount !== 1 ? 's' : ''} marked as "Claim Settled" but still in Processing status`, NC, ST.subtitle, 14);
  emptyRow(ws, r++, NC, ST.empty, 6);

  const headers = isGroup
    ? ['Handler', 'Claim ID', 'Secondary Status', 'Cause', 'Total Incurred', 'Days', 'TAT']
    : ['Claim ID', 'Secondary Status', 'Cause', 'Total Incurred', 'Days', 'TAT'];

  for (const d of dataSet) {
    if (isGroup) {
      mergedRow(ws, r++, `  Handler: ${d.handler}`, NC, ST.sectionDivider, 24);
    }

    if (d.pendingSettlement.length === 0) {
      mergedRow(ws, r++, '    No pending settlement claims.', NC, ST.subtitle, 16);
      if (isGroup) emptyRow(ws, r++, NC, ST.empty, 8);
      continue;
    }

    headers.forEach((h, c) => wc(ws, r, c, h, ST.purpleHeader));
    rh(ws, r++, 20);

    d.pendingSettlement.forEach((item, idx) => {
      const rSty = ST.settRow;
      const bSty = ST.settBold;
      const cSty = ST.settCurrency;
      const tSty = tatSty(item.tatPosition);
      const tLbl = tatLabel(item.tatPosition);

      if (isGroup) {
        wc(ws, r, 0, item.handler ?? '—', bSty);
        wc(ws, r, 1, item.claimId, bSty);
        wc(ws, r, 2, item.secondaryStatus ?? '—', rSty);
        wc(ws, r, 3, item.cause ?? '—', rSty);
        wc(ws, r, 4, zarStr(item.totalIncurred), cSty);
        wc(ws, r, 5, item.daysInStatus ?? '—', rSty);
        wc(ws, r, 6, tLbl, ST.settBadge);
      } else {
        wc(ws, r, 0, item.claimId, bSty);
        wc(ws, r, 1, item.secondaryStatus ?? '—', rSty);
        wc(ws, r, 2, item.cause ?? '—', rSty);
        wc(ws, r, 3, zarStr(item.totalIncurred), cSty);
        wc(ws, r, 4, item.daysInStatus ?? '—', rSty);
        wc(ws, r, 5, tLbl, ST.settBadge);
      }
      rh(ws, r++, 18);
    });

    if (isGroup) emptyRow(ws, r++, NC, ST.empty, 10);
  }

  if (totalCount === 0) {
    mergedRow(ws, r++, '    No pending settlement claims across all selected handlers.', NC, ST.subtitle, 20);
  }

  setRef(ws, r - 1, NC - 1);
  return ws;
}

function buildWorkbook(dataSet: HandlerData[], isGroup: boolean): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: isGroup ? 'Group Daily Report' : `${dataSet[0]?.handler ?? 'Handler'} Daily Report` };

  XLSX.utils.book_append_sheet(wb, buildActionSheet(dataSet, isGroup), 'Today\'s Action Items');
  XLSX.utils.book_append_sheet(wb, buildCsTatSheet(dataSet, isGroup), 'CS & TAT Health');
  XLSX.utils.book_append_sheet(wb, buildPortfolioSheet(dataSet, isGroup), 'My Portfolio');
  XLSX.utils.book_append_sheet(wb, buildPendingSheet(dataSet, isGroup), 'Pending Settlement');

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

    // Enforce role restriction for CLAIMS_TECHNICIAN
    if (ctx.role === 'CLAIMS_TECHNICIAN') {
      const ownName = ctx.fullName ?? '';
      handlerNames = handlerNames.filter(h => h === ownName);
      if (handlerNames.length === 0) handlerNames = [ownName];
    }

    const dataSet = await Promise.all(
      handlerNames.map(h => fetchHandlerData(h, snapshotDate)),
    );

    const wb = buildWorkbook(dataSet, reportType === 'group');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellStyles: true });

    const today = new Date().toISOString().split('T')[0];
    const filename = reportType === 'group'
      ? `Group_Report_${today}.xlsx`
      : `${handlerNames[0].replace(/\s+/g, '_')}_Daily_Report_${today}.xlsx`;

    return new NextResponse(buffer, {
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
