export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { computeFlags } from '@/lib/compute/fraud-signals';

export async function POST(request: Request) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['HEAD_OF_CLAIMS', 'TEAM_LEADER'].includes(ctx.role))
      return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { importRunId } = await request.json() as { importRunId?: string };
    if (!importRunId) return Response.json({ error: 'importRunId required' }, { status: 400 });

    const run = await prisma.importRun.findUnique({
      where: { id: importRunId },
      select: { id: true, periodStart: true },
    });
    if (!run) return Response.json({ error: 'Import run not found' }, { status: 404 });

    const snapshotDate = run.periodStart ?? new Date();
    await computeFlags(importRunId, snapshotDate);

    return Response.json({ success: true, importRunId });
  } catch (err) {
    console.error('[claims-flags]', err);
    return Response.json(
      { error: 'Flag computation failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
