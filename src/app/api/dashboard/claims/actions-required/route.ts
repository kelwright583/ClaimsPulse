import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

const ALLOWED_ROLES = ['HEAD_OF_CLAIMS', 'TEAM_LEADER'] as const;

async function getLatestSnapshotDate(): Promise<Date | null> {
  const result = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  return result?.snapshotDate ?? null;
}

function getEffectiveCancellationDate(dateOfLoss: Date): Date {
  const next = new Date(dateOfLoss);
  next.setMonth(next.getMonth() + 1);
  next.setDate(1);
  next.setHours(0, 0, 0, 0);
  return next;
}

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const actionType = searchParams.get('actionType');
    const handlerFilter = searchParams.get('handler');
    const statusFilter = searchParams.get('status');

    const latestDate = await getLatestSnapshotDate();
    if (!latestDate) {
      return NextResponse.json({ writeOffs: [], tpRecovery: [], salvageReferrals: [], repairerFollowUp: [] });
    }

    const snapshotDate = latestDate;

    // ── Write-offs ──────────────────────────────────────────────────────────────
    const writeOffClaims = (!actionType || actionType === 'write_off')
      ? await prisma.claimSnapshot.findMany({
          where: {
            snapshotDate,
            claimStatus: 'Finalised',
            cause: { in: ['Vehicle theft', 'Vehicle hijack'] },
            ...(handlerFilter ? { handler: handlerFilter } : {}),
          },
          select: {
            claimId: true,
            policyNumber: true,
            insured: true,
            dateOfLoss: true,
            cause: true,
            handler: true,
          },
        })
      : [];

    const writeOffClaimIds = writeOffClaims.map(r => r.claimId);

    // Also include manual write-off flagged claims not already in the above set
    const manualWriteOffActions = (!actionType || actionType === 'write_off') && writeOffClaimIds.length > 0
      ? await prisma.claimAction.findMany({
          where: { actionType: 'write_off', isComplete: true, claimId: { notIn: writeOffClaimIds } },
          select: { claimId: true },
        })
      : (!actionType || actionType === 'write_off')
        ? await prisma.claimAction.findMany({
            where: { actionType: 'write_off', isComplete: true },
            select: { claimId: true },
          })
        : [];

    const allWriteOffIds = [...writeOffClaimIds, ...manualWriteOffActions.map(r => r.claimId)];

    const uwNotifiedActions = allWriteOffIds.length > 0
      ? await prisma.claimAction.findMany({
          where: { claimId: { in: allWriteOffIds }, actionType: 'uw_notified', isComplete: true },
          select: { claimId: true },
        })
      : [];
    const uwNotifiedSet = new Set(uwNotifiedActions.map(r => r.claimId));

    const writeOffs = writeOffClaims.map(r => ({
      claimId: r.claimId,
      policyNumber: r.policyNumber,
      insured: r.insured,
      dateOfLoss: r.dateOfLoss ? r.dateOfLoss.toISOString().split('T')[0] : null,
      cause: r.cause,
      effectiveCancellationDate: r.dateOfLoss
        ? getEffectiveCancellationDate(r.dateOfLoss).toISOString().split('T')[0]
        : null,
      handler: r.handler,
      uwNotified: uwNotifiedSet.has(r.claimId),
    }));

    // ── TP Recovery ─────────────────────────────────────────────────────────────
    const tpRaw = (!actionType || actionType === 'tp_recovery')
      ? await prisma.claimSnapshot.findMany({
          where: {
            snapshotDate,
            claimStatus: 'Finalised',
            thirdPartyOs: { gt: 0 },
            ...(handlerFilter ? { handler: handlerFilter } : {}),
          },
          select: {
            claimId: true,
            insured: true,
            thirdPartyOs: true,
            handler: true,
            snapshotDate: true,
            dateOfLoss: true,
          },
        })
      : [];

    const tpClaimIds = tpRaw.map(r => r.claimId);
    const tpInstructedActions = tpClaimIds.length > 0
      ? await prisma.claimAction.findMany({
          where: { claimId: { in: tpClaimIds }, actionType: 'tp_instructed', isComplete: true },
          select: { claimId: true },
        })
      : [];
    const tpInstructedSet = new Set(tpInstructedActions.map(r => r.claimId));

    const tpRecovery = tpRaw
      .filter(r => !tpInstructedSet.has(r.claimId))
      .map(r => {
        const daysSince = r.snapshotDate && r.dateOfLoss
          ? Math.floor((r.snapshotDate.getTime() - r.dateOfLoss.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        return {
          claimId: r.claimId,
          insured: r.insured,
          tpOs: r.thirdPartyOs ? Number(r.thirdPartyOs) : 0,
          daysSinceFinalisation: daysSince,
          handler: r.handler,
          instructed: false,
        };
      });

    // ── Salvage Referrals ────────────────────────────────────────────────────────
    const salvageRaw = (!actionType || actionType === 'salvage')
      ? await prisma.claimSnapshot.findMany({
          where: {
            snapshotDate,
            claimStatus: 'Finalised',
            OR: [
              { totalSalvage: { gt: 0 } },
              { cause: { in: ['Vehicle theft', 'Vehicle hijack'] } },
            ],
            ...(handlerFilter ? { handler: handlerFilter } : {}),
          },
          select: {
            claimId: true,
            insured: true,
            totalSalvage: true,
            handler: true,
            snapshotDate: true,
            dateOfLoss: true,
          },
        })
      : [];

    const salvageClaimIds = salvageRaw.map(r => r.claimId);
    const salvageReferredActions = salvageClaimIds.length > 0
      ? await prisma.claimAction.findMany({
          where: { claimId: { in: salvageClaimIds }, actionType: 'salvage_referred' },
          select: { claimId: true },
        })
      : [];
    const salvageReferredSet = new Set(salvageReferredActions.map(r => r.claimId));

    const salvageReferrals = salvageRaw
      .filter(r => !salvageReferredSet.has(r.claimId))
      .map(r => {
        const daysSince = r.snapshotDate && r.dateOfLoss
          ? Math.floor((r.snapshotDate.getTime() - r.dateOfLoss.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        return {
          claimId: r.claimId,
          insured: r.insured,
          expectedSalvage: r.totalSalvage ? Number(r.totalSalvage) : null,
          daysSinceFinalisation: daysSince,
          handler: r.handler,
          referred: false,
        };
      });

    // ── Repairer Follow-up ───────────────────────────────────────────────────────
    const repairerRaw = (!actionType || actionType === 'repairer_followup')
      ? await prisma.claimSnapshot.findMany({
          where: {
            snapshotDate,
            secondaryStatus: 'Repair Completed - Awaiting Invoice',
            daysInCurrentStatus: { gt: 14 },
            ...(handlerFilter ? { handler: handlerFilter } : {}),
            ...(statusFilter ? { claimStatus: statusFilter } : {}),
          },
          select: { claimId: true, handler: true, daysInCurrentStatus: true },
        })
      : [];

    const repairerClaimIds = repairerRaw.map(r => r.claimId);

    // Get latest payment payee per claim for repairer name
    const repairerPayments = repairerClaimIds.length > 0
      ? await prisma.$queryRaw<{ claim_id: string; payee: string | null }[]>`
          SELECT DISTINCT ON (claim_id) claim_id, payee
          FROM payments
          WHERE claim_id = ANY(${repairerClaimIds}::text[])
          ORDER BY claim_id, printed_date DESC NULLS LAST
        `
      : [];
    const repairerPayeeMap = new Map(repairerPayments.map(r => [r.claim_id, r.payee]));

    const chasedActions = repairerClaimIds.length > 0
      ? await prisma.claimAction.findMany({
          where: { claimId: { in: repairerClaimIds }, actionType: 'repairer_chased', isComplete: true },
          select: { claimId: true },
        })
      : [];
    const chasedSet = new Set(chasedActions.map(r => r.claimId));

    const repairerFollowUp = repairerRaw.map(r => ({
      claimId: r.claimId,
      repairer: repairerPayeeMap.get(r.claimId) ?? null,
      daysWaiting: r.daysInCurrentStatus,
      handler: r.handler,
      chased: chasedSet.has(r.claimId),
    }));

    return NextResponse.json({ writeOffs, tpRecovery, salvageReferrals, repairerFollowUp });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
