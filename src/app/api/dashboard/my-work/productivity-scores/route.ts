import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

const CAPACITY = 150;

async function getLatestSnapshotDate(): Promise<Date | null> {
  const result = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  return result?.snapshotDate ?? null;
}

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    let handlerParam = searchParams.get('handler');

    if (ctx.role === 'CLAIMS_TECHNICIAN') {
      handlerParam = ctx.fullName ?? handlerParam;
    }

    const latestDate = await getLatestSnapshotDate();
    if (!latestDate) {
      return NextResponse.json({ leaderboard: [], selectedMetrics: null, workloadChart: [] });
    }

    const snapshotDate = latestDate;

    // Get all handlers (or a specific one)
    const handlerRows = await prisma.claimSnapshot.findMany({
      where: {
        snapshotDate,
        handler: handlerParam ? handlerParam : { not: null },
      },
      select: { handler: true },
      distinct: ['handler'],
      orderBy: { handler: 'asc' },
    });
    const handlers = handlerRows.map(r => r.handler!).filter(Boolean);

    const scorecards = await Promise.all(handlers.map(async (handler) => {
      const [openCount, finalisedCount, glassFinalisedCount, glassOpenCount, paidCount, breachCount] =
        await Promise.all([
          prisma.claimSnapshot.count({
            where: { snapshotDate, handler, claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] } },
          }),
          prisma.claimSnapshot.count({ where: { snapshotDate, handler, claimStatus: 'Finalised' } }),
          prisma.claimSnapshot.count({
            where: {
              snapshotDate,
              handler,
              claimStatus: 'Finalised',
              OR: [
                { cause: { contains: 'Windscreen', mode: 'insensitive' } },
                { cause: { contains: 'Glass', mode: 'insensitive' } },
              ],
            },
          }),
          prisma.claimSnapshot.count({
            where: {
              snapshotDate,
              handler,
              claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] },
              OR: [
                { cause: { contains: 'Windscreen', mode: 'insensitive' } },
                { cause: { contains: 'Glass', mode: 'insensitive' } },
              ],
            },
          }),
          prisma.claimSnapshot.count({
            where: {
              snapshotDate,
              handler,
              claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] },
              totalPaid: { gt: 0 },
            },
          }),
          prisma.claimSnapshot.count({ where: { snapshotDate, handler, isSlaBreach: true } }),
        ]);

      const glassDenominator = glassFinalisedCount + glassOpenCount;
      const finalisationGlass = glassDenominator > 0 ? (glassFinalisedCount / glassDenominator) * 100 : null;

      const complexFinalised = finalisedCount - glassFinalisedCount;
      const complexOpen = openCount - glassOpenCount;
      const complexDenominator = complexFinalised + complexOpen;
      const finalisationComplex = complexDenominator > 0 ? (complexFinalised / complexDenominator) * 100 : null;

      const paymentRate = openCount > 0 ? (paidCount / openCount) * 100 : null;
      const slaCompliance = openCount > 0 ? ((openCount - breachCount) / openCount) * 100 : null;

      return {
        handler,
        openCount,
        workloadScore: openCount,
        capacity: CAPACITY,
        finalisationGlass: finalisationGlass !== null ? Math.round(finalisationGlass * 10) / 10 : null,
        finalisationComplex: finalisationComplex !== null ? Math.round(finalisationComplex * 10) / 10 : null,
        paymentRate: paymentRate !== null ? Math.round(paymentRate * 10) / 10 : null,
        slaCompliance: slaCompliance !== null ? Math.round(slaCompliance * 10) / 10 : null,
        breachCount,
      };
    }));

    // Leaderboard sorted by workloadScore desc with rank
    const leaderboard = [...scorecards]
      .sort((a, b) => b.workloadScore - a.workloadScore)
      .map((s, idx) => ({ ...s, rank: idx + 1 }));

    // Selected metrics for the requested handler
    const selectedMetrics = handlerParam
      ? (scorecards.find(s => s.handler === handlerParam) ?? null)
      : null;

    // Workload chart
    const workloadChart = scorecards.map(s => ({
      handler: s.handler,
      workloadScore: s.workloadScore,
      capacity: s.capacity,
    }));

    return NextResponse.json({ leaderboard, selectedMetrics, workloadChart });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
