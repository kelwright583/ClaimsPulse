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
      return Response.json({ claims: [], stats: { total: 0, totalSalvage: 0, totalOs: 0 }, snapshotDate: null });
    }

    const snapshotDate = maxDate instanceof Date ? maxDate : new Date(maxDate);

    const claims = await prisma.claimSnapshot.findMany({
      where: {
        snapshotDate,
        secondaryStatus: 'Salvage Recovery in Process',
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
        isSlaBreach: true,
        totalSalvage: true,
        totalRecovery: true,
        totalOs: true,
        totalIncurred: true,
        totalPaid: true,
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
      isSlaBreach: c.isSlaBreach,
      totalSalvage: num(c.totalSalvage),
      totalRecovery: num(c.totalRecovery),
      totalOs: num(c.totalOs),
      totalIncurred: num(c.totalIncurred),
      totalPaid: num(c.totalPaid),
      dateOfLoss: c.dateOfLoss ? (c.dateOfLoss instanceof Date ? c.dateOfLoss.toISOString().split('T')[0] : String(c.dateOfLoss)) : null,
    }));

    const stats = {
      total: result.length,
      totalSalvage: result.reduce((s, c) => s + c.totalSalvage, 0),
      totalRecovery: result.reduce((s, c) => s + c.totalRecovery, 0),
      totalOs: result.reduce((s, c) => s + c.totalOs, 0),
    };

    return Response.json({ claims: result, stats, snapshotDate: snapshotDate.toISOString().split('T')[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
