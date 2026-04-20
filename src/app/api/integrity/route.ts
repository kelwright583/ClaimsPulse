import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAuth();

    // Get latest CLAIMS_OUTSTANDING import run
    const latestImport = await prisma.importRun.findFirst({
      where: { reportType: 'CLAIMS_OUTSTANDING' },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestImport) {
      return Response.json({
        flags: [],
        summary: {},
        totals: { alert: 0, warning: 0, total: 0 },
        snapshotDate: null,
        pipelineStatus: 'no_imports',
      });
    }

    // Use periodStart of the latest import as the canonical snapshot date.
    // Fall back to the most common snapshotDate among snapshots with this importRunId.
    let snapshotDate: Date | null = latestImport.periodStart ?? null;

    if (!snapshotDate) {
      const result = await prisma.$queryRaw<{ snapshot_date: Date; cnt: bigint }[]>`
        SELECT snapshot_date, COUNT(*) AS cnt
        FROM claim_snapshots
        WHERE import_run_id = ${latestImport.id}::uuid
        GROUP BY snapshot_date
        ORDER BY cnt DESC
        LIMIT 1
      `;
      snapshotDate = result[0]?.snapshot_date ?? null;
    }

    // Get all flags from the latest import run
    const flags = await prisma.claimFlag.findMany({
      where: { importRunId: latestImport.id },
      orderBy: { createdAt: 'desc' },
    });

    if (flags.length === 0) {
      return Response.json({
        flags: [],
        summary: {},
        totals: { alert: 0, warning: 0, total: 0 },
        snapshotDate: snapshotDate
          ? (snapshotDate instanceof Date ? snapshotDate : new Date(snapshotDate)).toISOString().split('T')[0]
          : null,
        pipelineStatus: 'no_flags_for_latest',
        importRunId: latestImport.id,
      });
    }

    // Get claim details for flagged claims
    const claimIds = [...new Set(flags.map(f => f.claimId))];
    const claims = snapshotDate && claimIds.length > 0
      ? await prisma.claimSnapshot.findMany({
          where: {
            claimId: { in: claimIds },
            snapshotDate: snapshotDate instanceof Date ? snapshotDate : new Date(snapshotDate),
          },
          select: {
            claimId: true,
            handler: true,
            insured: true,
            broker: true,
            totalIncurred: true,
            totalOs: true,
            claimStatus: true,
            cause: true,
          },
        })
      : [];

    const claimMap = new Map(claims.map(c => [c.claimId, c]));

    const enrichedFlags = flags.map(f => ({
      id: f.id,
      claimId: f.claimId,
      flagType: f.flagType,
      severity: f.severity,
      detail: f.detail,
      createdAt: f.createdAt.toISOString(),
      claim: claimMap.get(f.claimId) ? {
        handler: claimMap.get(f.claimId)!.handler,
        insured: claimMap.get(f.claimId)!.insured,
        broker: claimMap.get(f.claimId)!.broker,
        totalIncurred: Number(claimMap.get(f.claimId)!.totalIncurred ?? 0),
        claimStatus: claimMap.get(f.claimId)!.claimStatus,
        cause: claimMap.get(f.claimId)!.cause,
      } : null,
    }));

    // Summary counts by flag type
    const summary = flags.reduce((acc, f) => {
      acc[f.flagType] = (acc[f.flagType] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const alertCount = flags.filter(f => f.severity === 'alert').length;
    const warningCount = flags.filter(f => f.severity === 'warning').length;

    const resolvedDate = snapshotDate instanceof Date ? snapshotDate : snapshotDate ? new Date(snapshotDate) : null;

    return Response.json({
      flags: enrichedFlags,
      summary,
      totals: { alert: alertCount, warning: warningCount, total: flags.length },
      snapshotDate: resolvedDate ? resolvedDate.toISOString().split('T')[0] : null,
      pipelineStatus: 'ok',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
