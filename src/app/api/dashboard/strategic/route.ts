import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAuth();

    const now = new Date();

    // Get latest snapshot date
    const latestSnapshotResult = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(snapshot_date) as max FROM claim_snapshots
    `;
    const latestSnapshot = latestSnapshotResult[0]?.max;

    // Get latest financial period
    const latestFinancialResult = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(period_date) as max FROM financial_summaries
    `;
    const latestFinancial = latestFinancialResult[0]?.max;

    // Get latest import run
    const latestImport = await prisma.importRun.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    const [
      openClaims,
      slaClaimsData,
      bigClaimsCount,
      financialData,
      mailboxTotal,
      mailboxResponded,
    ] = await Promise.all([
      // Open claims count (not finalized)
      latestSnapshot
        ? prisma.claimSnapshot.count({
            where: {
              snapshotDate: latestSnapshot,
              claimStatus: { not: 'Finalized' },
            },
          })
        : Promise.resolve(0),

      // SLA compliance data
      latestSnapshot
        ? prisma.claimSnapshot.aggregate({
            where: { snapshotDate: latestSnapshot },
            _count: { id: true },
          }).then(async total => {
            const breached = await prisma.claimSnapshot.count({
              where: { snapshotDate: latestSnapshot, isSlaBreach: true },
            });
            return { total: total._count.id, breached };
          })
        : Promise.resolve({ total: 0, breached: 0 }),

      // Big claims
      latestImport
        ? prisma.claimFlag.count({
            where: { importRunId: latestImport.id, flagType: 'BIG_CLAIM' },
          })
        : Promise.resolve(0),

      // Financial data
      latestFinancial
        ? prisma.financialSummary.findMany({
            where: { periodDate: latestFinancial },
          })
        : Promise.resolve([]),

      // Mailbox TAT — total
      prisma.emailRecord.count(),

      // Mailbox TAT — responded or not breached
      prisma.emailRecord.count({
        where: {
          OR: [
            { respondedTo: true },
            { tatDeadline: { gt: now } },
          ],
        },
      }),
    ]);

    // Compute loss ratio
    const netIncurredRec = financialData.find(f => f.metric === 'net_incurred');
    const netWpRec = financialData.find(f => f.metric === 'net_wp');
    const lossRatio =
      netIncurredRec && netWpRec && Number(netWpRec.value) > 0
        ? Number(netIncurredRec.value) / Number(netWpRec.value)
        : null;

    // Reserve position
    const netOutstandingRec = financialData.find(f => f.metric === 'net_outstanding');
    const reservePosition = netOutstandingRec ? Number(netOutstandingRec.value) : null;

    // SLA compliance
    const slaCompliance =
      slaClaimsData.total > 0
        ? ((slaClaimsData.total - slaClaimsData.breached) / slaClaimsData.total) * 100
        : null;

    // GWP vs target
    const latestPremiumResult = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(period_date) as max FROM premium_records
    `;
    const latestPremiumDate = latestPremiumResult[0]?.max;

    let gwpVsTarget: { gwp: number; target: number | null } | null = null;
    if (latestPremiumDate) {
      const gwpAgg = await prisma.premiumRecord.aggregate({
        where: { periodDate: latestPremiumDate },
        _sum: { gwp: true },
      });
      const gwpVal = gwpAgg._sum.gwp ? Number(gwpAgg._sum.gwp) : 0;

      const targetRecord = await prisma.target.findFirst({
        where: {
          metricType: 'net_wp',
          uwYear: new Date(latestPremiumDate).getFullYear(),
        },
      });

      gwpVsTarget = { gwp: gwpVal, target: targetRecord ? Number(targetRecord.annualTarget) : null };
    }

    // Mailbox TAT compliance
    const mailboxTatCompliance =
      mailboxTotal > 0 ? (mailboxResponded / mailboxTotal) * 100 : null;

    // Claims trend — last 6 months
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const trendRaw = await prisma.$queryRaw<Array<{ month: string; count: bigint }>>`
      SELECT TO_CHAR(snapshot_date, 'YYYY-MM') as month,
             COUNT(DISTINCT claim_id) as count
      FROM claim_snapshots
      WHERE snapshot_date >= ${sixMonthsAgo}
      GROUP BY TO_CHAR(snapshot_date, 'YYYY-MM')
      ORDER BY month ASC
    `;

    const claimsTrend = trendRaw.map(r => ({
      month: r.month,
      count: Number(r.count),
    }));

    return Response.json({
      lossRatio,
      openClaims,
      slaCompliance,
      gwpVsTarget,
      mailboxTatCompliance,
      bigClaimsCount,
      reservePosition,
      claimsTrend,
      asOf: latestSnapshot ?? now,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
