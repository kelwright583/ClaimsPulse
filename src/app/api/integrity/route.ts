import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAuth();

    // Get latest snapshot date
    const latest = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(snapshot_date) as max FROM claim_snapshots
    `;
    const maxDate = latest[0]?.max;

    // Get all flags from the latest import run
    const latestImport = await prisma.importRun.findFirst({
      where: { reportType: 'CLAIMS_OUTSTANDING' },
      orderBy: { createdAt: 'desc' },
    });

    const flags = latestImport
      ? await prisma.claimFlag.findMany({
          where: { importRunId: latestImport.id },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    // Get claim details for flagged claims
    const claimIds = [...new Set(flags.map(f => f.claimId))];
    const claims = maxDate && claimIds.length > 0
      ? await prisma.claimSnapshot.findMany({
          where: {
            claimId: { in: claimIds },
            snapshotDate: maxDate instanceof Date ? maxDate : new Date(maxDate),
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

    return Response.json({
      flags: enrichedFlags,
      summary,
      totals: { alert: alertCount, warning: warningCount, total: flags.length },
      snapshotDate: maxDate
        ? (maxDate instanceof Date ? maxDate : new Date(maxDate)).toISOString().split('T')[0]
        : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
