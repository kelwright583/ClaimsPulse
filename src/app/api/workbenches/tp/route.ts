import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function num(v: unknown) { return Number(v ?? 0); }

export async function GET() {
  try {
    await requireAuth();

    const latest = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(snapshot_date) as max FROM claim_snapshots
    `;
    const maxDate = latest[0]?.max;

    if (!maxDate) {
      return Response.json({ claims: [], stats: { total: 0, totalTpOs: 0, totalTpPaid: 0, totalRecovery: 0 }, snapshotDate: null });
    }

    const snapshotDate = maxDate instanceof Date ? maxDate : new Date(maxDate);

    const claims = await prisma.claimSnapshot.findMany({
      where: {
        snapshotDate,
        secondaryStatus: 'Own damage claim finalised, TP claim in Process',
      },
      select: {
        claimId: true,
        handler: true,
        insured: true,
        broker: true,
        cause: true,
        claimStatus: true,
        secondaryStatus: true,
        daysInCurrentStatus: true,
        isTatBreach: true,
        thirdPartyOs: true,
        thirdPartyPaid: true,
        tpLiabilityOs: true,
        tpLiabilityPaid: true,
        totalRecovery: true,
        totalOs: true,
        totalIncurred: true,
        dateOfLoss: true,
      },
      orderBy: [{ daysInCurrentStatus: 'desc' }, { claimId: 'asc' }],
    });

    const result = claims.map(c => ({
      claimId: c.claimId,
      handler: c.handler ?? 'Unassigned',
      insured: c.insured,
      broker: c.broker,
      cause: c.cause,
      claimStatus: c.claimStatus,
      daysInCurrentStatus: c.daysInCurrentStatus ?? 0,
      isTatBreach: c.isTatBreach,
      thirdPartyOs: num(c.thirdPartyOs),
      thirdPartyPaid: num(c.thirdPartyPaid),
      tpLiabilityOs: num(c.tpLiabilityOs),
      tpLiabilityPaid: num(c.tpLiabilityPaid),
      totalRecovery: num(c.totalRecovery),
      totalOs: num(c.totalOs),
      totalIncurred: num(c.totalIncurred),
      dateOfLoss: c.dateOfLoss ? (c.dateOfLoss instanceof Date ? c.dateOfLoss.toISOString().split('T')[0] : String(c.dateOfLoss)) : null,
    }));

    const stats = {
      total: result.length,
      totalTpOs: result.reduce((s, c) => s + c.thirdPartyOs + c.tpLiabilityOs, 0),
      totalTpPaid: result.reduce((s, c) => s + c.thirdPartyPaid + c.tpLiabilityPaid, 0),
      totalRecovery: result.reduce((s, c) => s + c.totalRecovery, 0),
    };

    return Response.json({ claims: result, stats, snapshotDate: snapshotDate.toISOString().split('T')[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
