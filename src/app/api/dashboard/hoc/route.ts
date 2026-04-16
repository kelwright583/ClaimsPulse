import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

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
        totalOpenClaims: 0,
        totalIncurred: 0,
        totalOutstanding: 0,
        slaBreachCount: 0,
        bigClaimsCount: 0,
        deltaStats: { newClaims: 0, statusChanges: 0, valueJumps: 0, finalised: 0 },
        handlerScorecard: [],
        reserveFlags: [],
        snapshotDate: null,
      });
    }

    const snapshotDate = maxDate instanceof Date ? maxDate : new Date(maxDate);

    // All snapshots for the latest date (excluding finalised/repudiated/cancelled)
    const openStatuses = ['Finalised', 'Repudiated', 'Cancelled'];

    const [allSnapshots, slaBreaches, latestRun] = await Promise.all([
      prisma.claimSnapshot.findMany({
        where: {
          snapshotDate,
          NOT: { claimStatus: { in: openStatuses } },
        },
        select: {
          claimId: true,
          handler: true,
          claimStatus: true,
          secondaryStatus: true,
          cause: true,
          totalIncurred: true,
          totalOs: true,
          daysInCurrentStatus: true,
          isSlaBreach: true,
          reserveUtilisationPct: true,
          deltaFlags: true,
          insured: true,
          broker: true,
        },
      }),
      prisma.claimSnapshot.count({
        where: { snapshotDate, isSlaBreach: true },
      }),
      prisma.importRun.findFirst({
        where: { reportType: 'CLAIMS_OUTSTANDING' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Aggregates
    let totalIncurred = 0;
    let totalOutstanding = 0;

    const handlerMap = new Map<string, {
      openClaims: number;
      totalOs: number;
      slaBreaches: number;
      finalisedThisMonth: number;
    }>();

    const BIG_CLAIM_THRESHOLD = 250000;
    const BIG_CLAIM_CAUSES = ['theft', 'hijack', 'hi-jack'];

    let bigClaimsCount = 0;
    const newClaims = { count: 0 };
    const statusChanges = { count: 0 };
    const valueJumps = { count: 0 };
    const finalisedCount = { count: 0 };
    const reserveFlags: {
      claimId: string;
      handler: string | null;
      reserveUtilisationPct: number;
      severity: 'warning' | 'critical';
    }[] = [];

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    for (const s of allSnapshots) {
      const incurred = Number(s.totalIncurred ?? 0);
      const os = Number(s.totalOs ?? 0);
      totalIncurred += incurred;
      totalOutstanding += os;

      // Handler scorecard
      const handler = s.handler ?? 'Unassigned';
      if (!handlerMap.has(handler)) {
        handlerMap.set(handler, { openClaims: 0, totalOs: 0, slaBreaches: 0, finalisedThisMonth: 0 });
      }
      const hData = handlerMap.get(handler)!;
      hData.openClaims++;
      hData.totalOs += os;
      if (s.isSlaBreach) hData.slaBreaches++;

      // Big claims
      const causeLower = (s.cause ?? '').toLowerCase();
      if (
        incurred > BIG_CLAIM_THRESHOLD ||
        BIG_CLAIM_CAUSES.some(c => causeLower.includes(c))
      ) {
        bigClaimsCount++;
      }

      // Delta flags
      const flags = (s.deltaFlags && typeof s.deltaFlags === 'object' && !Array.isArray(s.deltaFlags))
        ? s.deltaFlags as Record<string, boolean> : {};
      if (flags['new_claim']) newClaims.count++;
      if (flags['status_changed'] || flags['secondary_status_change']) statusChanges.count++;
      if (flags['value_jump_20pct']) valueJumps.count++;
      if (flags['finalised']) finalisedCount.count++;

      // Reserve flags
      const utilPct = Number(s.reserveUtilisationPct ?? 0);
      if (utilPct > 80) {
        reserveFlags.push({
          claimId: s.claimId,
          handler: s.handler,
          reserveUtilisationPct: utilPct,
          severity: utilPct > 150 ? 'critical' : 'warning',
        });
      }
    }

    // Finalised this month — separate query
    const finalisedThisMonth = await prisma.claimSnapshot.findMany({
      where: {
        snapshotDate,
        claimStatus: 'Finalised',
        deltaFlags: { path: ['finalised'], equals: true },
      },
      select: { handler: true },
    });

    for (const f of finalisedThisMonth) {
      const handler = f.handler ?? 'Unassigned';
      if (handlerMap.has(handler)) {
        handlerMap.get(handler)!.finalisedThisMonth++;
      }
    }

    const handlerScorecard = Array.from(handlerMap.entries()).map(([handler, stats]) => ({
      handler,
      openClaims: stats.openClaims,
      avgOutstanding: stats.openClaims > 0 ? stats.totalOs / stats.openClaims : 0,
      slaBreaches: stats.slaBreaches,
      finalisedThisMonth: stats.finalisedThisMonth,
    })).sort((a, b) => b.openClaims - a.openClaims);

    // Limit reserve flags and sort by severity
    reserveFlags.sort((a, b) => b.reserveUtilisationPct - a.reserveUtilisationPct);

    return Response.json({
      totalOpenClaims: allSnapshots.length,
      totalIncurred,
      totalOutstanding,
      slaBreachCount: slaBreaches,
      bigClaimsCount,
      deltaStats: {
        newClaims: newClaims.count,
        statusChanges: statusChanges.count,
        valueJumps: valueJumps.count,
        finalised: finalisedCount.count,
      },
      handlerScorecard,
      reserveFlags: reserveFlags.slice(0, 50),
      snapshotDate: snapshotDate.toISOString().split('T')[0],
      latestImportId: latestRun?.id ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
