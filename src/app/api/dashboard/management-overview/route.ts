import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const compareFrom = searchParams.get('compareFrom');

    // Get latest completed import run for CLAIMS_OUTSTANDING
    const latestImport = await prisma.importRun.findFirst({
      where: { reportType: 'CLAIMS_OUTSTANDING' },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestImport) {
      return Response.json({
        outstandingClaims: 0,
        claimsOpenedToday: 0,
        claimsClosedToday: 0,
        tatBreachRate: null,
        averageIncurred: null,
        largeClaimsCount: 0,
        asOf: new Date().toISOString(),
      });
    }

    // Get the latest snapshot date from this import run
    const latestSnapshotResult = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(snapshot_date) as max FROM claim_snapshots WHERE import_run_id = ${latestImport.id}::uuid
    `;
    const snapshotDate = latestSnapshotResult[0]?.max;

    if (!snapshotDate) {
      return Response.json({
        outstandingClaims: 0,
        claimsOpenedToday: 0,
        claimsClosedToday: 0,
        tatBreachRate: null,
        averageIncurred: null,
        largeClaimsCount: 0,
        asOf: latestImport.createdAt.toISOString(),
      });
    }

    const [
      outstandingClaims,
      tatData,
      incurredData,
      largeClaimsCount,
      claimsOpenedToday,
      claimsClosedToday,
    ] = await Promise.all([
      // Outstanding (open) claims — not Finalized
      prisma.claimSnapshot.count({
        where: {
          snapshotDate,
          claimStatus: { not: 'Finalized' },
        },
      }),

      // TAT breach data for open claims
      prisma.claimSnapshot.aggregate({
        where: {
          snapshotDate,
          claimStatus: { not: 'Finalized' },
        },
        _count: { id: true },
      }).then(async total => {
        const breached = await prisma.claimSnapshot.count({
          where: {
            snapshotDate,
            claimStatus: { not: 'Finalized' },
            isTatBreach: true,
          },
        });
        return { total: total._count.id, breached };
      }),

      // Average incurred for open claims
      prisma.claimSnapshot.aggregate({
        where: {
          snapshotDate,
          claimStatus: { not: 'Finalized' },
          totalIncurred: { not: null },
        },
        _avg: { totalIncurred: true },
      }),

      // Large claims > R250k
      prisma.claimSnapshot.count({
        where: {
          snapshotDate,
          totalIncurred: { gt: 250000 },
        },
      }),

      // Claims opened today — deltaFlags contains new_claim
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM claim_snapshots
        WHERE snapshot_date = ${snapshotDate}::date
          AND delta_flags::jsonb ? 'new_claim'
      `.then(r => Number(r[0]?.count ?? 0)),

      // Claims closed today — deltaFlags contains finalised
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM claim_snapshots
        WHERE snapshot_date = ${snapshotDate}::date
          AND delta_flags::jsonb ? 'finalised'
      `.then(r => Number(r[0]?.count ?? 0)),
    ]);

    const tatBreachRate =
      tatData.total > 0
        ? (tatData.breached / tatData.total) * 100
        : null;

    const averageIncurred = incurredData._avg.totalIncurred
      ? Number(incurredData._avg.totalIncurred)
      : null;

    // Comparison data
    let comparison: {
      outstandingClaims: number;
      claimsOpenedToday: number;
      claimsClosedToday: number;
      tatBreachRate: number | null;
      averageIncurred: number | null;
      largeClaimsCount: number;
    } | null = null;

    if (compareFrom) {
      const fromDate = new Date(compareFrom);
      const [cOutstanding, cTatData, cIncurredData, cLarge, cOpened, cClosed] = await Promise.all([
        prisma.claimSnapshot.count({ where: { snapshotDate: fromDate, claimStatus: { not: 'Finalized' } } }),
        prisma.claimSnapshot.aggregate({ where: { snapshotDate: fromDate, claimStatus: { not: 'Finalized' } }, _count: { id: true } })
          .then(async total => {
            const breached = await prisma.claimSnapshot.count({ where: { snapshotDate: fromDate, claimStatus: { not: 'Finalized' }, isTatBreach: true } });
            return { total: total._count.id, breached };
          }),
        prisma.claimSnapshot.aggregate({ where: { snapshotDate: fromDate, claimStatus: { not: 'Finalized' }, totalIncurred: { not: null } }, _avg: { totalIncurred: true } }),
        prisma.claimSnapshot.count({ where: { snapshotDate: fromDate, totalIncurred: { gt: 250000 } } }),
        prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM claim_snapshots WHERE snapshot_date = ${fromDate}::date AND delta_flags::jsonb ? 'new_claim'`.then(r => Number(r[0]?.count ?? 0)),
        prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM claim_snapshots WHERE snapshot_date = ${fromDate}::date AND delta_flags::jsonb ? 'finalised'`.then(r => Number(r[0]?.count ?? 0)),
      ]);
      comparison = {
        outstandingClaims: cOutstanding,
        claimsOpenedToday: cOpened,
        claimsClosedToday: cClosed,
        tatBreachRate: cTatData.total > 0 ? (cTatData.breached / cTatData.total) * 100 : null,
        averageIncurred: cIncurredData._avg.totalIncurred ? Number(cIncurredData._avg.totalIncurred) : null,
        largeClaimsCount: cLarge,
      };
    }

    return Response.json({
      outstandingClaims,
      claimsOpenedToday,
      claimsClosedToday,
      tatBreachRate,
      averageIncurred,
      largeClaimsCount,
      asOf: snapshotDate.toISOString(),
      comparison,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
