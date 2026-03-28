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

function serializeDelay(d: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v instanceof Date) {
      out[k] = v.toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const claimId = decodeURIComponent(id);

    const [snapshots, acknowledgedDelays] = await Promise.all([
      prisma.claimSnapshot.findMany({
        where: { claimId },
        orderBy: { snapshotDate: 'asc' },
      }),
      prisma.acknowledgedDelay.findMany({
        where: { claimId },
        orderBy: { loggedAt: 'desc' },
      }),
    ]);

    if (snapshots.length === 0) {
      return Response.json({ error: 'Claim not found' }, { status: 404 });
    }

    const latestSnapshot = snapshots[snapshots.length - 1];

    return Response.json({
      snapshots: snapshots.map(s => serializeSnapshot(s as unknown as Record<string, unknown>)),
      latestSnapshot: serializeSnapshot(latestSnapshot as unknown as Record<string, unknown>),
      acknowledgedDelays: acknowledgedDelays.map(d => serializeDelay(d as unknown as Record<string, unknown>)),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
