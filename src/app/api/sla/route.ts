import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

function serializeSnapshot(s: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (v instanceof Date) {
      out[k] = v.toISOString();
    } else if (v !== null && typeof v === 'object' && 'toFixed' in v) {
      out[k] = Number(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function GET() {
  try {
    await requireAuth();

    // Get latest snapshot date
    const latest = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(snapshot_date) as max FROM claim_snapshots
    `;
    const maxDate = latest[0]?.max;
    if (!maxDate) {
      return Response.json({
        breaches: [],
        grouped: {},
        stats: { total: 0, critical: 0, urgent: 0, standard: 0 },
        acknowledgedDelays: [],
        snapshotDate: null,
      });
    }

    const snapshotDate = maxDate instanceof Date ? maxDate : new Date(maxDate);

    const [breaches, slaConfigs, activeDelays] = await Promise.all([
      prisma.claimSnapshot.findMany({
        where: { snapshotDate, isTatBreach: true },
        orderBy: [{ secondaryStatus: 'asc' }, { daysInCurrentStatus: 'desc' }],
      }),
      prisma.tatConfig.findMany({ where: { isActive: true } }),
      prisma.acknowledgedDelay.findMany({
        where: { isActive: true },
        select: { claimId: true, secondaryStatus: true, reasonType: true, expectedDate: true },
      }),
    ]);

    const slaMap = new Map(slaConfigs.map(c => [c.secondaryStatus, c]));

    // Group by secondaryStatus
    const grouped: Record<string, {
      priority: string;
      maxDays: number;
      claims: ReturnType<typeof serializeSnapshot>[];
    }> = {};

    let critical = 0, urgent = 0, standard = 0;

    for (const s of breaches) {
      const status = s.secondaryStatus ?? 'Unknown';
      const sla = s.secondaryStatus ? slaMap.get(s.secondaryStatus) : null;
      const priority = sla?.priority ?? 'standard';

      if (!grouped[status]) {
        grouped[status] = {
          priority,
          maxDays: sla?.maxDays ?? 0,
          claims: [],
        };
      }

      grouped[status].claims.push(serializeSnapshot(s as unknown as Record<string, unknown>));

      if (priority === 'critical') critical++;
      else if (priority === 'urgent') urgent++;
      else standard++;
    }

    const delayData = activeDelays.map(d => ({
      ...d,
      expectedDate: d.expectedDate.toISOString(),
    }));

    return Response.json({
      breaches: breaches.map(s => serializeSnapshot(s as unknown as Record<string, unknown>)),
      grouped,
      stats: { total: breaches.length, critical, urgent, standard },
      acknowledgedDelays: delayData,
      snapshotDate: snapshotDate.toISOString().split('T')[0],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
