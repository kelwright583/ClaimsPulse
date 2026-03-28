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

    // Latest snapshot date
    const latest = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(snapshot_date) as max FROM claim_snapshots
    `;
    const maxDate = latest[0]?.max;

    if (!maxDate) {
      return Response.json({ handlers: [], snapshotDate: null, assessorPipeline: [] });
    }

    const snapshotDate =
      maxDate instanceof Date ? maxDate : new Date(maxDate);

    // Fetch team leader names to exclude from productivity benchmarks
    const teamLeaders = await prisma.profile.findMany({
      where: { role: 'TEAM_LEADER' },
      select: { fullName: true },
    });
    const teamLeaderNames = new Set(
      teamLeaders.map(p => p.fullName).filter(Boolean) as string[],
    );

    // All snapshots for latest date
    const snapshots = await prisma.claimSnapshot.findMany({
      where: { snapshotDate },
      select: {
        claimId: true,
        handler: true,
        claimStatus: true,
        secondaryStatus: true,
        cause: true,
        totalOs: true,
        deltaFlags: true,
        daysInCurrentStatus: true,
        complexityWeight: true,
      },
    });

    // All payment claim IDs (most recent import run payments)
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

    // Group by handler
    const handlerMap = new Map<string, HandlerSnapshot[]>();
    for (const s of snapshots) {
      const handler = s.handler?.trim() || 'Unassigned';
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

    // Compute metrics per handler (excluding team leaders)
    const handlers = Array.from(handlerMap.entries())
      .filter(([handler]) => !teamLeaderNames.has(handler))
      .map(([handler, snaps]) =>
        computeHandlerMetrics(handler, snaps, paymentClaimIds),
      )
      .sort((a, b) => b.complexityScore - a.complexityScore);

    // Assessor pipeline: claims where secondaryStatus = 'Assessor Appointed'
    const assessorPipeline = snapshots
      .filter(s => s.secondaryStatus === 'Assessor Appointed')
      .map(s => ({
        claimId: s.claimId,
        handler: s.handler ?? 'Unassigned',
        claimStatus: s.claimStatus,
        daysInCurrentStatus: s.daysInCurrentStatus ?? 0,
        totalOs: Number(s.totalOs ?? 0),
        cause: s.cause,
      }))
      .sort((a, b) => b.daysInCurrentStatus - a.daysInCurrentStatus);

    return Response.json({
      handlers,
      snapshotDate: snapshotDate.toISOString().split('T')[0],
      assessorPipeline,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized')
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
