import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function num(v: unknown) { return Number(v ?? 0); }

export async function GET() {
  try {
    await requireAuth();

    const [latestSnap, premiumRecords, financialSummaries, statusCounts, handlerCounts] = await Promise.all([
      prisma.$queryRaw<{ max: Date | null }[]>`SELECT MAX(snapshot_date) as max FROM claim_snapshots`,
      prisma.premiumRecord.findMany({ select: { gwp: true, netWp: true, netComm: true } }),
      prisma.financialSummary.findMany({ orderBy: { periodDate: 'asc' }, select: { periodDate: true, section: true, level: true, metric: true, value: true } }),
      prisma.$queryRaw<{ claim_status: string; count: bigint }[]>`
        SELECT claim_status, COUNT(*) as count
        FROM claim_snapshots
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM claim_snapshots)
        GROUP BY claim_status
      `,
      prisma.$queryRaw<{ handler: string | null; count: bigint; total_incurred: number }[]>`
        SELECT handler, COUNT(*) as count, SUM(total_incurred::numeric) as total_incurred
        FROM claim_snapshots
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM claim_snapshots)
          AND handler IS NOT NULL
          AND claim_status NOT IN ('Finalised','Repudiated','Cancelled')
        GROUP BY handler
        ORDER BY count DESC
        LIMIT 5
      `,
    ]);

    const maxDate = latestSnap[0]?.max;

    // Aggregate premiums
    const totalGwp = premiumRecords.reduce((s, r) => s + num(r.gwp), 0);
    const totalNetWp = premiumRecords.reduce((s, r) => s + num(r.netWp), 0);

    // Latest financial summary period
    const latestPeriodDate = financialSummaries.length > 0
      ? financialSummaries[financialSummaries.length - 1].periodDate.toISOString().split('T')[0]
      : null;
    const summaryMap = new Map<string, number>();
    for (const s of financialSummaries) {
      const key = `${s.periodDate.toISOString().split('T')[0]}|${s.section}|${s.level}|${s.metric}`;
      summaryMap.set(key, num(s.value));
    }
    function getSummary(section: string, level: string, metric: string) {
      if (!latestPeriodDate) return 0;
      return summaryMap.get(`${latestPeriodDate}|${section}|${level}|${metric}`) ?? 0;
    }

    const totalIncurredSummary = getSummary('claims', 'net', 'incurred');
    const uwResultNet = getSummary('uw_result', 'net', 'uw_result');
    const lossRatio = totalNetWp > 0 && totalIncurredSummary !== 0
      ? (totalIncurredSummary / totalNetWp) * 100
      : null;

    // Claims from latest snapshot
    const latestClaims = maxDate
      ? await prisma.claimSnapshot.findMany({
          where: { snapshotDate: maxDate instanceof Date ? maxDate : new Date(maxDate) },
          select: { claimStatus: true, totalIncurred: true, totalOs: true, totalPaid: true, isSlaBreach: true },
        })
      : [];

    const openClaims = latestClaims.filter(c => !['Finalised', 'Repudiated', 'Cancelled'].includes(c.claimStatus ?? '')).length;
    const slaBreaches = latestClaims.filter(c => c.isSlaBreach).length;
    const totalIncurred = latestClaims.reduce((s, c) => s + num(c.totalIncurred), 0);
    const totalOs = latestClaims.reduce((s, c) => s + num(c.totalOs), 0);
    const totalPaid = latestClaims.reduce((s, c) => s + num(c.totalPaid), 0);

    const statusBreakdown = statusCounts.map(r => ({
      status: r.claim_status ?? 'Unknown',
      count: Number(r.count),
    }));

    const topHandlers = handlerCounts.map(r => ({
      handler: r.handler ?? 'Unknown',
      count: Number(r.count),
      totalIncurred: num(r.total_incurred),
    }));

    return Response.json({
      summary: {
        openClaims,
        slaBreaches,
        totalIncurred,
        totalOs,
        totalPaid,
        totalGwp,
        totalNetWp,
        lossRatio,
        uwResultNet,
        hasPremiumData: premiumRecords.length > 0,
        hasMovementData: financialSummaries.length > 0,
      },
      statusBreakdown,
      topHandlers,
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
