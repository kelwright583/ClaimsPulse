import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

async function getLatestSnapshotDate(): Promise<Date | null> {
  const result = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  return result?.snapshotDate ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface ScoreComponents {
  speed: number;
  quality: number;
  coverage: number;
  finalisation: number;
  total: number;
}

async function computeScore(handler: string | null, snapshotDate: Date): Promise<ScoreComponents | null> {
  const handlerWhere: any = handler ? { handler } : {};

  const [openClaims, breachCount] = await Promise.all([
    prisma.claimSnapshot.findMany({
      where: { snapshotDate, ...handlerWhere, claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] } },
      select: { daysInCurrentStatus: true, daysOpen: true, totalPaid: true, isTatBreach: true },
    }),
    prisma.claimSnapshot.count({
      where: { snapshotDate, ...handlerWhere, isTatBreach: true },
    }),
  ]);

  // Return null if no data for this snapshot/handler combo
  if (openClaims.length === 0) return null;

  const totalOpen = openClaims.length;

  // Speed: 25 - min(25, (avgDaysToFirstPayment / 30) * 25)
  const paidClaims = openClaims.filter(c => c.totalPaid && Number(c.totalPaid) > 0);
  const avgDaysToFirstPayment = paidClaims.length > 0
    ? paidClaims.reduce((sum, c) => sum + (c.daysOpen ?? c.daysInCurrentStatus ?? 0), 0) / paidClaims.length
    : 30;
  const speed = clamp(25 - Math.min(25, (avgDaysToFirstPayment / 30) * 25), 0, 25);

  // Quality: max(0, 25 - (reopenRate * 25))
  const reopenedCount = await prisma.claimSnapshot.count({
    where: {
      snapshotDate,
      ...handlerWhere,
      deltaFlags: { path: ['reopened'], equals: true },
    },
  });
  const reopenRate = totalOpen > 0 ? reopenedCount / totalOpen : 0;
  const quality = Math.max(0, 25 - reopenRate * 25);

  // Coverage: min(25, tatCompliance * 25)
  const tatCompliance = totalOpen > 0 ? (totalOpen - breachCount) / totalOpen : 1;
  const coverage = Math.min(25, tatCompliance * 25);

  // Finalisation: 25 - min(25, (avgDaysOpen / 90) * 25)
  const finalisedClaims = await prisma.claimSnapshot.findMany({
    where: { snapshotDate, ...handlerWhere, claimStatus: 'Finalised' },
    select: { daysInCurrentStatus: true, daysOpen: true },
  });
  const avgDaysOpen = finalisedClaims.length > 0
    ? finalisedClaims.reduce((sum, c) => sum + (c.daysOpen ?? c.daysInCurrentStatus ?? 0), 0) / finalisedClaims.length
    : 90;
  const finalisation = clamp(25 - Math.min(25, (avgDaysOpen / 90) * 25), 0, 25);

  return {
    speed: Math.round(speed * 10) / 10,
    quality: Math.round(quality * 10) / 10,
    coverage: Math.round(coverage * 10) / 10,
    finalisation: Math.round(finalisation * 10) / 10,
    total: Math.round((speed + quality + coverage + finalisation) * 10) / 10,
  };
}

function buildCoachingNote(components: ScoreComponents): string {
  const entries: [keyof Omit<ScoreComponents, 'total'>, number][] = [
    ['speed', components.speed],
    ['quality', components.quality],
    ['coverage', components.coverage],
    ['finalisation', components.finalisation],
  ];
  const lowest = [...entries].sort((a, b) => a[1] - b[1])[0][0];
  const notes: Record<string, string> = {
    speed: 'Focus on issuing first payments earlier to improve your response speed score.',
    quality: 'Reduce claim reopening by ensuring thorough assessment and documentation before closure.',
    coverage: 'Address TAT breaches by prioritising claims that are approaching or have passed their deadline.',
    finalisation: 'Work to reduce the average time to close claims in your portfolio by resolving long-running claims.',
  };
  return notes[lowest] ?? 'Keep up the consistent performance across all areas.';
}

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    let handler = searchParams.get('handler');

    if (ctx.role === 'CLAIMS_TECHNICIAN') {
      handler = ctx.fullName ?? handler;
    }

    const latestDate = await getLatestSnapshotDate();
    if (!latestDate) {
      return NextResponse.json({
        handler,
        csScore: null,
        slaBreachByStatus: [],
        notificationGap: { handler: null, allHandlers: null },
        weeklyTrend: [],
        breachingClaims: {},
      });
    }

    const snapshotDate = latestDate;

    // Previous calendar month: find the closest snapshot date in that month
    const prevMonthDate = new Date(snapshotDate);
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);

    const prevMonthStart = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), 1);
    const prevMonthEnd = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0, 23, 59, 59);

    const prevMonthSnap = await prisma.claimSnapshot.findFirst({
      where: { snapshotDate: { gte: prevMonthStart, lte: prevMonthEnd } },
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    });

    const [currentScore, lastMonthScore] = await Promise.all([
      computeScore(handler, snapshotDate),
      prevMonthSnap ? computeScore(handler, prevMonthSnap.snapshotDate) : Promise.resolve(null),
    ]);

    // SLA breach by secondary status
    const breachByStatusRaw = await prisma.claimSnapshot.groupBy({
      by: ['secondaryStatus'],
      where: {
        snapshotDate,
        isTatBreach: true,
        ...(handler ? { handler } : {}),
      },
      _count: { claimId: true },
      orderBy: { _count: { claimId: 'desc' } },
    });

    const slaBreachByStatus = breachByStatusRaw.map(r => ({
      secondaryStatus: r.secondaryStatus ?? 'Unknown',
      count: r._count.claimId,
    }));

    // Breaching claims detail grouped by secondaryStatus
    const breachingClaimsRaw = await prisma.claimSnapshot.findMany({
      where: {
        snapshotDate,
        isTatBreach: true,
        ...(handler ? { handler } : {}),
      },
      select: { claimId: true, secondaryStatus: true, daysInCurrentStatus: true },
    });

    const breachingClaims: Record<string, { claimId: string; daysInCurrentStatus: number | null }[]> = {};
    for (const r of breachingClaimsRaw) {
      const key = r.secondaryStatus ?? 'Unknown';
      if (!breachingClaims[key]) breachingClaims[key] = [];
      breachingClaims[key].push({ claimId: r.claimId, daysInCurrentStatus: r.daysInCurrentStatus });
    }

    // Notification gap: handler vs all handlers
    const [handlerNotifGap, allNotifGap] = await Promise.all([
      handler
        ? prisma.claimSnapshot.aggregate({
            where: { snapshotDate, handler, notificationGapDays: { not: null } },
            _avg: { notificationGapDays: true },
          })
        : Promise.resolve(null),
      prisma.claimSnapshot.aggregate({
        where: { snapshotDate, notificationGapDays: { not: null } },
        _avg: { notificationGapDays: true },
      }),
    ]);

    const notificationGap = {
      handler: handlerNotifGap?._avg.notificationGapDays
        ? Math.round(Number(handlerNotifGap._avg.notificationGapDays) * 10) / 10
        : null,
      allHandlers: allNotifGap._avg.notificationGapDays
        ? Math.round(Number(allNotifGap._avg.notificationGapDays) * 10) / 10
        : null,
    };

    // Weekly trend: last 12 unique snapshot dates (most recent back)
    const recentSnapDates = await prisma.claimSnapshot.findMany({
      where: { snapshotDate: { lte: snapshotDate } },
      select: { snapshotDate: true },
      distinct: ['snapshotDate'],
      orderBy: { snapshotDate: 'desc' },
      take: 12,
    });

    // Reverse so oldest first for chart rendering
    const snapDatesAsc = [...recentSnapDates].reverse();

    const weeklyTrend = await Promise.all(
      snapDatesAsc.map(async ({ snapshotDate: weekSnapDate }) => {
        const weekScore = await computeScore(handler, weekSnapDate);
        return {
          week: weekSnapDate.toISOString().split('T')[0],
          csScore: weekScore?.total ?? null,
        };
      })
    );

    return NextResponse.json({
      handler,
      csScore: currentScore
        ? {
            speed: currentScore.speed,
            quality: currentScore.quality,
            coverage: currentScore.coverage,
            finalisation: currentScore.finalisation,
            total: currentScore.total,
            lastMonth: lastMonthScore?.total ?? null,
          }
        : null,
      coachingNote: currentScore ? buildCoachingNote(currentScore) : null,
      slaBreachByStatus,
      notificationGap,
      weeklyTrend,
      breachingClaims,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
