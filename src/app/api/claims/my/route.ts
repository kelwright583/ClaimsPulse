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
    const ctx = await requireAuth();

    if (!ctx.fullName) {
      return Response.json({ data: [], total: 0, snapshotDate: null });
    }

    // Get latest snapshot date
    const latest = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(snapshot_date) as max FROM claim_snapshots
    `;
    const maxDate = latest[0]?.max;
    if (!maxDate) {
      return Response.json({ data: [], total: 0, snapshotDate: null });
    }

    const snapshotDate = maxDate instanceof Date ? maxDate : new Date(maxDate);

    const snapshots = await prisma.claimSnapshot.findMany({
      where: {
        snapshotDate,
        handler: ctx.fullName,
      },
      orderBy: { claimId: 'asc' },
    });

    const slaConfigs = await prisma.slaConfig.findMany({ where: { isActive: true } });
    const slaMap = new Map(slaConfigs.map(c => [c.secondaryStatus, c]));

    const data = snapshots.map(s => {
      const sla = s.secondaryStatus ? slaMap.get(s.secondaryStatus) : null;
      return {
        ...serializeSnapshot(s as unknown as Record<string, unknown>),
        slaPriority: sla?.priority ?? null,
        slaMaxDays: sla?.maxDays ?? null,
      };
    });

    return Response.json({
      data,
      total: data.length,
      snapshotDate: snapshotDate.toISOString().split('T')[0],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
