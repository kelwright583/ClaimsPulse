import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function num(v: unknown) { return Number(v ?? 0); }

async function computeDelta(
  todayDate: Date,
  yesterdayDate: Date,
  handlerFilter: string | null,
) {
  const baseSelect = { claimId: true, handler: true, insured: true, claimStatus: true, secondaryStatus: true, totalIncurred: true, totalOs: true, cause: true } as const;
  const handlerWhere = handlerFilter ? { handler: handlerFilter } : {};

  const [todaySnaps, yesterdaySnaps] = await Promise.all([
    prisma.claimSnapshot.findMany({ where: { snapshotDate: todayDate, ...handlerWhere }, select: baseSelect }),
    prisma.claimSnapshot.findMany({ where: { snapshotDate: yesterdayDate, ...handlerWhere }, select: baseSelect }),
  ]);

  const yesterdayMap = new Map(yesterdaySnaps.map(s => [s.claimId, s]));

  const newClaims: typeof todaySnaps = [];
  const finalisedClaims: typeof todaySnaps = [];
  const statusChanges: Array<{ claimId: string; handler: string | null; insured: string | null; from: string | null; to: string | null; secondaryFrom: string | null; secondaryTo: string | null }> = [];
  const valueJumps: Array<{ claimId: string; handler: string | null; insured: string | null; prevIncurred: number; currIncurred: number; pctChange: number }> = [];
  const reopened: typeof todaySnaps = [];

  for (const today of todaySnaps) {
    const prev = yesterdayMap.get(today.claimId);
    if (!prev) { newClaims.push(today); continue; }
    if (today.claimStatus === 'Re-opened' && prev.claimStatus !== 'Re-opened') reopened.push(today);
    if (today.claimStatus !== prev.claimStatus || today.secondaryStatus !== prev.secondaryStatus) {
      if (today.claimStatus === 'Finalised' && prev.claimStatus !== 'Finalised') finalisedClaims.push(today);
      statusChanges.push({ claimId: today.claimId, handler: today.handler, insured: today.insured, from: prev.claimStatus, to: today.claimStatus, secondaryFrom: prev.secondaryStatus, secondaryTo: today.secondaryStatus });
    }
    const prevInc = num(prev.totalIncurred);
    const currInc = num(today.totalIncurred);
    if (prevInc > 0 && currInc > prevInc * 1.2) {
      valueJumps.push({ claimId: today.claimId, handler: today.handler, insured: today.insured, prevIncurred: prevInc, currIncurred: currInc, pctChange: ((currInc - prevInc) / prevInc) * 100 });
    }
  }

  return {
    newClaims,
    finalisedClaims,
    statusChanges,
    valueJumps: valueJumps.sort((a, b) => b.pctChange - a.pctChange),
    reopened,
    summary: { new: newClaims.length, finalised: finalisedClaims.length, statusChanges: statusChanges.length, valueJumps: valueJumps.length, reopened: reopened.length },
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const handlerFilter = searchParams.get('handler');

    // Get two most recent snapshot dates (fallback)
    const dates = await prisma.$queryRaw<{ snapshot_date: Date }[]>`
      SELECT DISTINCT snapshot_date FROM claim_snapshots
      ORDER BY snapshot_date DESC
      LIMIT 3
    `;

    if (dates.length < 2) {
      return Response.json({
        today: dates[0]?.snapshot_date?.toISOString().split('T')[0] ?? null,
        yesterday: null,
        newClaims: [], finalisedClaims: [], statusChanges: [], valueJumps: [], reopened: [],
        summary: { new: 0, finalised: 0, statusChanges: 0, valueJumps: 0, reopened: 0 },
        previousPeriodSummary: null,
        handlers: [],
      });
    }

    // Resolve dates from params or fallback to two most recent
    let todayDate: Date;
    let yesterdayDate: Date;
    if (toParam && fromParam) {
      todayDate = new Date(toParam);
      yesterdayDate = new Date(fromParam);
    } else {
      todayDate = dates[0].snapshot_date;
      yesterdayDate = dates[1].snapshot_date;
    }

    const delta = await computeDelta(todayDate, yesterdayDate, handlerFilter);

    // Previous period summary (the period BEFORE fromDate)
    let previousPeriodSummary = null;
    if (dates.length >= 3) {
      const prevBeforeDate = dates.find(d => d.snapshot_date < yesterdayDate);
      if (prevBeforeDate) {
        const prevDelta = await computeDelta(yesterdayDate, prevBeforeDate.snapshot_date, handlerFilter);
        previousPeriodSummary = prevDelta.summary;
      }
    }

    // Available handlers
    const handlerRows = await prisma.claimSnapshot.findMany({
      where: { snapshotDate: todayDate, handler: { not: null } },
      select: { handler: true },
      distinct: ['handler'],
      orderBy: { handler: 'asc' },
    });

    return Response.json({
      today: todayDate.toISOString().split('T')[0],
      yesterday: yesterdayDate.toISOString().split('T')[0],
      newClaims: delta.newClaims.slice(0, 100),
      finalisedClaims: delta.finalisedClaims.slice(0, 100),
      statusChanges: delta.statusChanges.slice(0, 200),
      valueJumps: delta.valueJumps.slice(0, 50),
      reopened: delta.reopened.slice(0, 50),
      summary: delta.summary,
      previousPeriodSummary,
      handlers: handlerRows.map(r => r.handler!).filter(Boolean),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
