import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import {
  computeHandlerMetrics,
  type HandlerSnapshot,
} from '@/lib/compute/productivity';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAuth();

    const latest = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(snapshot_date) as max FROM claim_snapshots
    `;
    const maxDate = latest[0]?.max;

    if (!maxDate) {
      return Response.json({
        totalOpenClaims: 0,
        slaBreachCount: 0,
        finalisedToday: 0,
        pendingApprovals: [],
        escalations: [],
        handlerMetrics: [],
        snapshotDate: null,
      });
    }

    const snapshotDate =
      maxDate instanceof Date ? maxDate : new Date(maxDate);

    const teamLeaders = await prisma.profile.findMany({
      where: { role: 'TEAM_LEADER' },
      select: { fullName: true },
    });
    const teamLeaderNames = new Set(
      teamLeaders.map(p => p.fullName).filter(Boolean) as string[],
    );

    const snapshots = await prisma.claimSnapshot.findMany({
      where: { snapshotDate },
      select: {
        claimId: true,
        handler: true,
        claimStatus: true,
        secondaryStatus: true,
        cause: true,
        totalOs: true,
        totalIncurred: true,
        isSlaBreach: true,
        deltaFlags: true,
        daysInCurrentStatus: true,
        complexityWeight: true,
        insured: true,
      },
    });

    const CLOSED = new Set(['Finalised', 'Repudiated', 'Cancelled']);
    const openSnapshots = snapshots.filter(
      s => !CLOSED.has(s.claimStatus ?? ''),
    );

    const slaBreachCount = snapshots.filter(s => s.isSlaBreach).length;
    const finalisedToday = snapshots.filter(s =>
      Array.isArray(s.deltaFlags) &&
      (s.deltaFlags as string[]).includes('finalised'),
    ).length;

    // Pending management approvals
    const pendingApprovals = snapshots
      .filter(s => s.secondaryStatus === 'Authorisation Pending Approval from Management')
      .map(s => ({
        claimId: s.claimId,
        handler: s.handler ?? 'Unassigned',
        daysInCurrentStatus: s.daysInCurrentStatus ?? 0,
        totalOs: Number(s.totalOs ?? 0),
      }))
      .sort((a, b) => b.daysInCurrentStatus - a.daysInCurrentStatus);

    // Escalations to management
    const escalations = snapshots
      .filter(s => s.secondaryStatus === 'Problematic Claim - Escalated to Management')
      .map(s => ({
        claimId: s.claimId,
        handler: s.handler ?? 'Unassigned',
        daysInCurrentStatus: s.daysInCurrentStatus ?? 0,
        totalIncurred: Number(s.totalIncurred ?? 0),
      }))
      .sort((a, b) => b.daysInCurrentStatus - a.daysInCurrentStatus);

    // Payment claim IDs
    const latestPayeeRun = await prisma.importRun.findFirst({
      where: { reportType: 'PAYEE' },
      orderBy: { createdAt: 'desc' },
    });
    const paymentClaimIds = new Set<string>();
    if (latestPayeeRun) {
      const payments = await prisma.payment.findMany({
        where: { importRunId: latestPayeeRun.id },
        select: { claimId: true },
        distinct: ['claimId'],
      });
      for (const p of payments) paymentClaimIds.add(p.claimId);
    }

    // Group by handler (exclude team leaders)
    const handlerMap = new Map<string, HandlerSnapshot[]>();
    for (const s of snapshots) {
      const handler = s.handler?.trim() || 'Unassigned';
      if (teamLeaderNames.has(handler)) continue;
      if (!handlerMap.has(handler)) handlerMap.set(handler, []);
      handlerMap.get(handler)!.push({
        claimId: s.claimId,
        claimStatus: s.claimStatus,
        secondaryStatus: s.secondaryStatus,
        cause: s.cause,
        totalOs: Number(s.totalOs ?? 0),
        deltaFlags: Array.isArray(s.deltaFlags) ? (s.deltaFlags as string[]) : [],
        daysInCurrentStatus: s.daysInCurrentStatus,
        complexityWeight: s.complexityWeight,
      });
    }

    // Attach SLA breach counts per handler
    const slaByHandler = new Map<string, number>();
    for (const s of snapshots) {
      if (s.isSlaBreach) {
        const h = s.handler?.trim() || 'Unassigned';
        slaByHandler.set(h, (slaByHandler.get(h) ?? 0) + 1);
      }
    }

    const handlerMetrics = Array.from(handlerMap.entries())
      .map(([handler, snaps]) => ({
        ...computeHandlerMetrics(handler, snaps, paymentClaimIds),
        slaBreaches: slaByHandler.get(handler) ?? 0,
      }))
      .sort((a, b) => b.slaBreaches - a.slaBreaches || b.openClaims - a.openClaims);

    return Response.json({
      totalOpenClaims: openSnapshots.length,
      slaBreachCount,
      finalisedToday,
      pendingApprovals: pendingApprovals.slice(0, 20),
      escalations: escalations.slice(0, 20),
      handlerMetrics,
      snapshotDate: snapshotDate.toISOString().split('T')[0],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized')
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
