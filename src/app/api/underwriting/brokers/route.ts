import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAuth();

    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Broker ranking from PremiumRecord
    const brokerRaw = await prisma.$queryRaw<Array<{
      broker: string | null;
      gwp: unknown;
      net_wp: unknown;
      gross_comm: unknown;
    }>>`
      SELECT broker,
             SUM(gwp) as gwp,
             SUM(net_wp) as net_wp,
             SUM(gross_comm) as gross_comm
      FROM premium_records
      WHERE period_date >= ${sixMonthsAgo}
        AND broker IS NOT NULL
      GROUP BY broker
      ORDER BY gwp DESC
    `;

    // Get approximate loss ratios from ClaimSnapshot (match by broker field)
    const latestSnapshotResult = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(snapshot_date) as max FROM claim_snapshots
    `;
    const latestSnapshot = latestSnapshotResult[0]?.max;

    interface ClaimBrokerRow {
      broker: string | null;
      total_incurred: unknown;
    }

    let claimsByBroker: ClaimBrokerRow[] = [];
    if (latestSnapshot) {
      claimsByBroker = await prisma.$queryRaw<ClaimBrokerRow[]>`
        SELECT broker,
               SUM(total_incurred) as total_incurred
        FROM claim_snapshots
        WHERE snapshot_date = ${latestSnapshot}
          AND broker IS NOT NULL
        GROUP BY broker
      `;
    }

    const claimMap = new Map(
      claimsByBroker.map(r => [r.broker?.toLowerCase(), Number(r.total_incurred ?? 0)])
    );

    const brokerData = brokerRaw.map(r => {
      const gwp = Number(r.gwp ?? 0);
      const netWp = Number(r.net_wp ?? 0);
      const grossComm = Number(r.gross_comm ?? 0);
      const grossCommPct = netWp > 0 ? (grossComm / netWp) * 100 : null;

      const totalIncurred = r.broker ? (claimMap.get(r.broker.toLowerCase()) ?? null) : null;
      const lossRatio =
        totalIncurred !== null && netWp > 0
          ? { value: (totalIncurred / netWp) * 100, approximate: true }
          : null;

      return {
        broker: r.broker ?? 'Unknown',
        gwp,
        netWp,
        grossComm,
        grossCommPct,
        lossRatio,
      };
    });

    return Response.json(brokerData);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
