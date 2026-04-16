import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

function n(v: unknown): number | null {
  if (v == null) return null;
  const num = Number(v);
  return isNaN(num) ? null : num;
}

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    // Get the latest snapshot for this claim
    const snap = await prisma.claimSnapshot.findFirst({
      where: { claimId: id },
      orderBy: { snapshotDate: 'desc' },
      select: {
        claimId: true, handler: true, claimStatus: true, secondaryStatus: true,
        cause: true, lossArea: true, insured: true, broker: true,
        dateOfLoss: true, dateOfNotification: true, dateOfRegistration: true,
        daysInCurrentStatus: true, daysOpen: true,
        intimatedAmount: true, totalPaid: true, totalOs: true, totalIncurred: true,
        totalRecovery: true, totalSalvage: true, isSlaBreach: true,
        ownDamagePaid: true, thirdPartyPaid: true, expensesPaid: true,
        legalCostsPaid: true, assessorFeesPaid: true, towingPaid: true,
        ownDamageOs: true, thirdPartyOs: true, expensesOs: true,
        legalCostsOs: true, assessorFeesOs: true,
      },
    });

    if (!snap) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Snapshot history for timeline
    const history = await prisma.claimSnapshot.findMany({
      where: { claimId: id },
      orderBy: { snapshotDate: 'desc' },
      take: 20,
      select: { snapshotDate: true, claimStatus: true, secondaryStatus: true },
    });

    return NextResponse.json({
      claimId: snap.claimId,
      handler: snap.handler ?? null,
      claimStatus: snap.claimStatus ?? null,
      secondaryStatus: snap.secondaryStatus ?? null,
      cause: snap.cause ?? null,
      lossArea: snap.lossArea ?? null,
      insured: snap.insured ?? null,
      broker: snap.broker ?? null,
      dateOfLoss: snap.dateOfLoss?.toISOString() ?? null,
      dateOfNotification: snap.dateOfNotification?.toISOString() ?? null,
      dateOfRegistration: snap.dateOfRegistration?.toISOString() ?? null,
      daysInCurrentStatus: snap.daysInCurrentStatus ?? null,
      daysOpen: snap.daysOpen ?? null,
      intimatedAmount: n(snap.intimatedAmount),
      totalPaid: n(snap.totalPaid),
      totalOutstanding: n(snap.totalOs),
      totalIncurred: n(snap.totalIncurred),
      totalRecovery: n(snap.totalRecovery),
      totalSalvage: n(snap.totalSalvage),
      isSlaBreach: snap.isSlaBreach,
      ownDamagePaid: n(snap.ownDamagePaid),
      thirdPartyPaid: n(snap.thirdPartyPaid),
      expensesPaid: n(snap.expensesPaid),
      legalCostsPaid: n(snap.legalCostsPaid),
      assessorFeesPaid: n(snap.assessorFeesPaid),
      towingPaid: n(snap.towingPaid),
      ownDamageOs: n(snap.ownDamageOs),
      thirdPartyOs: n(snap.thirdPartyOs),
      expensesOs: n(snap.expensesOs),
      legalCostsOs: n(snap.legalCostsOs),
      assessorFeesOs: n(snap.assessorFeesOs),
      snapshotHistory: history.map(h => ({
        snapshotDate: h.snapshotDate.toISOString(),
        claimStatus: h.claimStatus ?? null,
        secondaryStatus: h.secondaryStatus ?? null,
      })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
