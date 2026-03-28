import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

const ALLOWED_ROLES = ['HEAD_OF_CLAIMS', 'TEAM_LEADER', 'CLAIMS_TECHNICIAN'] as const;
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
  if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const handlerFilter = searchParams.get('handler');

    const latestDate = await getLatestSnapshotDate();
    if (!latestDate) return NextResponse.json({ scorecards: [] });

    const snapshotDate = latestDate;

    // Determine which handlers to include
    const effectiveHandler = ctx.role === 'CLAIMS_TECHNICIAN'
      ? (ctx.fullName ?? handlerFilter)
      : handlerFilter;

    const handlerRows = await prisma.claimSnapshot.findMany({
      where: {
        snapshotDate,
        handler: effectiveHandler
          ? effectiveHandler
          : { not: null },
      },
      select: { handler: true },
      distinct: ['handler'],
      orderBy: { handler: 'asc' },
    });
    const handlers = handlerRows.map(r => r.handler!).filter(Boolean);

    const scorecards = await Promise.all(handlers.map(async (handler) => {
      const latestWhere: any = { handler, snapshotDate };

      const [openCount, breachCount, finalisedCount, glassFinalisedCount, glassOpenCount, paidCount] =
        await Promise.all([
          prisma.claimSnapshot.count({
            where: { ...latestWhere, claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] } },
          }),
          prisma.claimSnapshot.count({ where: { ...latestWhere, isSlaBreach: true } }),
          prisma.claimSnapshot.count({ where: { ...latestWhere, claimStatus: 'Finalised' } }),
          prisma.claimSnapshot.count({
            where: {
              ...latestWhere,
              claimStatus: 'Finalised',
              OR: [
                { cause: { contains: 'Windscreen', mode: 'insensitive' } },
                { cause: { contains: 'Glass', mode: 'insensitive' } },
              ],
            },
          }),
          prisma.claimSnapshot.count({
            where: {
              ...latestWhere,
              claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] },
              OR: [
                { cause: { contains: 'Windscreen', mode: 'insensitive' } },
                { cause: { contains: 'Glass', mode: 'insensitive' } },
              ],
            },
          }),
          prisma.claimSnapshot.count({
            where: {
              ...latestWhere,
              claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] },
              totalPaid: { gt: 0 },
            },
          }),
        ]);

      // Acknowledged delays: fetch claim IDs for handler then count
      const handlerClaimIds = await prisma.claimSnapshot.findMany({
        where: latestWhere,
        select: { claimId: true },
      });
      const claimIdList = handlerClaimIds.map(r => r.claimId);
      const acknowledgedDelayCount = claimIdList.length > 0
        ? await prisma.acknowledgedDelay.count({ where: { claimId: { in: claimIdList }, isActive: true } })
        : 0;

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
        csScore: null,
        breachCount,
        acknowledgedDelayCount,
      };
    }));

    return NextResponse.json({ scorecards });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
