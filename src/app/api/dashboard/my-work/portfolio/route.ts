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

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    let handler = searchParams.get('handler');
    const status = searchParams.get('status');
    const cause = searchParams.get('cause');
    const tatPosition = searchParams.get('tatPosition');

    // CLAIMS_TECHNICIAN: force to own name
    if (ctx.role === 'CLAIMS_TECHNICIAN') {
      handler = ctx.fullName ?? handler;
    }

    const latestDate = await getLatestSnapshotDate();
    if (!latestDate) {
      return NextResponse.json({
        stats: { openClaims: 0, totalOutstanding: 0, tatBreaches: 0, activeDelays: 0 },
        claims: [],
      });
    }

    const snapshotDate = latestDate;

    const where: any = {
      snapshotDate,
      claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] },
    };
    if (handler) where.handler = handler;
    if (status) where.claimStatus = status;
    if (cause) where.cause = { contains: cause, mode: 'insensitive' };
    if (tatPosition === 'breach') where.isTatBreach = true;

    const [openCount, aggregateResult, tatBreachCount] = await Promise.all([
      prisma.claimSnapshot.count({ where }),
      prisma.claimSnapshot.aggregate({ where, _sum: { totalOs: true } }),
      prisma.claimSnapshot.count({ where: { ...where, isTatBreach: true } }),
    ]);

    // Fetch claims for the portfolio
    const claimsRaw = await prisma.claimSnapshot.findMany({
      where,
      take: 100,
      orderBy: { totalOs: 'desc' },
      select: {
        claimId: true,
        claimStatus: true,
        secondaryStatus: true,
        cause: true,
        daysInCurrentStatus: true,
        daysOpen: true,
        totalIncurred: true,
        totalOs: true,
        isTatBreach: true,
      },
    });

    const claimIds = claimsRaw.map(r => r.claimId);

    // Active delays for these claims
    const activeDelayRecords = claimIds.length > 0
      ? await prisma.acknowledgedDelay.findMany({
          where: { claimId: { in: claimIds }, isActive: true },
          select: { claimId: true },
        })
      : [];

    const activeDelaysCount = await (claimIds.length > 0
      ? prisma.acknowledgedDelay.count({ where: { claimId: { in: claimIds }, isActive: true } })
      : Promise.resolve(0));

    const activeDelaySet = new Set(activeDelayRecords.map(d => d.claimId));

    // SLA configs for tatPosition computation
    const tatConfigs = await prisma.tatConfig.findMany({ where: { isActive: true } });
    const slaMap = new Map(tatConfigs.map(c => [c.secondaryStatus, c]));

    const claims = claimsRaw
      .map(r => {
        const tatConfig = r.secondaryStatus ? slaMap.get(r.secondaryStatus) : null;
        let slaPos: 'on-track' | 'at-risk' | 'breach' = 'on-track';
        if (r.isTatBreach) {
          slaPos = 'breach';
        } else if (tatConfig && r.daysInCurrentStatus && r.daysInCurrentStatus > tatConfig.maxDays * 0.8) {
          slaPos = 'at-risk';
        }
        return {
          claimId: r.claimId,
          claimStatus: r.claimStatus,
          secondaryStatus: r.secondaryStatus,
          cause: r.cause,
          daysOpen: r.daysOpen ?? r.daysInCurrentStatus,
          totalIncurred: r.totalIncurred ? Number(r.totalIncurred) : null,
          totalOs: r.totalOs ? Number(r.totalOs) : null,
          tatPosition: slaPos,
          hasActiveDelay: activeDelaySet.has(r.claimId),
        };
      })
      .filter(r => {
        if (!tatPosition || tatPosition === 'breach') return true;
        return r.tatPosition === tatPosition;
      });

    return NextResponse.json({
      stats: {
        openClaims: openCount,
        totalOutstanding: aggregateResult._sum.totalOs ? Number(aggregateResult._sum.totalOs) : 0,
        tatBreaches: tatBreachCount,
        activeDelays: activeDelaysCount,
      },
      claims,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
