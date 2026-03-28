import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function num(v: unknown) { return Number(v ?? 0); }

export async function GET() {
  try {
    await requireAuth();

    // Get two most recent snapshot dates
    const dates = await prisma.$queryRaw<{ snapshot_date: Date }[]>`
      SELECT DISTINCT snapshot_date FROM claim_snapshots
      ORDER BY snapshot_date DESC
      LIMIT 2
    `;

    if (dates.length < 2) {
      return Response.json({
        today: dates[0]?.snapshot_date?.toISOString().split('T')[0] ?? null,
        yesterday: null,
        newClaims: [],
        finalisedClaims: [],
        statusChanges: [],
        valueJumps: [],
        reopened: [],
        summary: { new: 0, finalised: 0, statusChanges: 0, valueJumps: 0, reopened: 0 },
      });
    }

    const todayDate = dates[0].snapshot_date;
    const yesterdayDate = dates[1].snapshot_date;

    const [todaySnaps, yesterdaySnaps] = await Promise.all([
      prisma.claimSnapshot.findMany({
        where: { snapshotDate: todayDate },
        select: { claimId: true, handler: true, insured: true, claimStatus: true, secondaryStatus: true, totalIncurred: true, totalOs: true, cause: true },
      }),
      prisma.claimSnapshot.findMany({
        where: { snapshotDate: yesterdayDate },
        select: { claimId: true, handler: true, insured: true, claimStatus: true, secondaryStatus: true, totalIncurred: true, totalOs: true, cause: true },
      }),
    ]);

    const yesterdayMap = new Map(yesterdaySnaps.map(s => [s.claimId, s]));

    const newClaims: typeof todaySnaps = [];
    const finalisedClaims: typeof todaySnaps = [];
    const statusChanges: Array<{
      claimId: string;
      handler: string | null;
      insured: string | null;
      from: string | null;
      to: string | null;
      secondaryFrom: string | null;
      secondaryTo: string | null;
    }> = [];
    const valueJumps: Array<{
      claimId: string;
      handler: string | null;
      insured: string | null;
      prevIncurred: number;
      currIncurred: number;
      pctChange: number;
    }> = [];
    const reopened: typeof todaySnaps = [];

    for (const today of todaySnaps) {
      const prev = yesterdayMap.get(today.claimId);
      if (!prev) {
        newClaims.push(today);
        continue;
      }
      if (today.claimStatus === 'Re-opened' && prev.claimStatus !== 'Re-opened') {
        reopened.push(today);
      }
      if (today.claimStatus !== prev.claimStatus || today.secondaryStatus !== prev.secondaryStatus) {
        if (today.claimStatus === 'Finalised' && prev.claimStatus !== 'Finalised') {
          finalisedClaims.push(today);
        }
        statusChanges.push({
          claimId: today.claimId,
          handler: today.handler,
          insured: today.insured,
          from: prev.claimStatus,
          to: today.claimStatus,
          secondaryFrom: prev.secondaryStatus,
          secondaryTo: today.secondaryStatus,
        });
      }
      const prevInc = num(prev.totalIncurred);
      const currInc = num(today.totalIncurred);
      if (prevInc > 0 && currInc > prevInc * 1.2) {
        valueJumps.push({
          claimId: today.claimId,
          handler: today.handler,
          insured: today.insured,
          prevIncurred: prevInc,
          currIncurred: currInc,
          pctChange: ((currInc - prevInc) / prevInc) * 100,
        });
      }
    }

    return Response.json({
      today: todayDate.toISOString().split('T')[0],
      yesterday: yesterdayDate.toISOString().split('T')[0],
      newClaims: newClaims.slice(0, 100),
      finalisedClaims: finalisedClaims.slice(0, 100),
      statusChanges: statusChanges.slice(0, 200),
      valueJumps: valueJumps.sort((a, b) => b.pctChange - a.pctChange).slice(0, 50),
      reopened: reopened.slice(0, 50),
      summary: {
        new: newClaims.length,
        finalised: finalisedClaims.length,
        statusChanges: statusChanges.length,
        valueJumps: valueJumps.length,
        reopened: reopened.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
