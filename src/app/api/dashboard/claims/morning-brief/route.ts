import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

const ALLOWED_ROLES = ['HEAD_OF_CLAIMS', 'TEAM_LEADER'] as const;

async function getLatestSnapshotDate(): Promise<Date | null> {
  const result = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  return result?.snapshotDate ?? null;
}

export async function GET(_request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const latestDate = await getLatestSnapshotDate();
    if (!latestDate) {
      return NextResponse.json({
        alertCards: { slaBreaches: 0, redFlags: 0, bigClaimsOpen: 0, unassignedWithPayment: 0 },
        attention: { uploadDate: null, readyToClose: 0, newlyBreached: 0, valueJumps: 0, stagnant: 0 },
        handlerHealth: [],
      });
    }

    const snapshotDate = latestDate;

    // Previous snapshot date
    const prevSnap = await prisma.claimSnapshot.findFirst({
      where: { snapshotDate: { lt: snapshotDate } },
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    });
    const prevDate = prevSnap?.snapshotDate ?? null;

    // Alert cards
    const [slaBreaches, bigClaimsOpen, redFlags, unassignedWithPayment] = await Promise.all([
      prisma.claimSnapshot.count({ where: { snapshotDate, isSlaBreach: true } }),
      prisma.claimSnapshot.count({
        where: {
          snapshotDate,
          claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] },
          totalIncurred: { gt: 250000 },
        },
      }),
      prisma.claimFlag.count({ where: { detail: { path: ['actioned'], equals: false } } }),
      prisma.claimSnapshot.count({
        where: { snapshotDate, handler: null, totalPaid: { gt: 0 } },
      }),
    ]);

    // Latest import run for uploadDate
    const latestRun = await prisma.importRun.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    // Ready to close: open claims with R0 total outstanding
    const readyToClose = await prisma.claimSnapshot.count({
      where: {
        snapshotDate,
        claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] },
        OR: [{ totalOs: null }, { totalOs: 0 }],
      },
    });

    // Newly breached: breached today but NOT yesterday
    let newlyBreached = 0;
    if (prevDate) {
      const [breachedToday, breachedYesterday] = await Promise.all([
        prisma.claimSnapshot.findMany({
          where: { snapshotDate, isSlaBreach: true },
          select: { claimId: true },
        }),
        prisma.claimSnapshot.findMany({
          where: { snapshotDate: prevDate, isSlaBreach: true },
          select: { claimId: true },
        }),
      ]);
      const prevBreachSet = new Set(breachedYesterday.map(r => r.claimId));
      newlyBreached = breachedToday.filter(r => !prevBreachSet.has(r.claimId)).length;
    }

    // Value jumps and stagnant from delta flags
    const deltaSnapshots = await prisma.claimSnapshot.findMany({
      where: { snapshotDate, deltaFlags: { not: undefined } },
      select: { deltaFlags: true, isSlaBreach: true },
    });

    let valueJumps = 0, stagnant = 0;
    for (const s of deltaSnapshots) {
      const flags = s.deltaFlags as Record<string, unknown> | null;
      if (!flags) continue;
      if (flags['value_jump_20pct']) valueJumps++;
      if (s.isSlaBreach && !flags['secondary_status_change']) stagnant++;
    }

    // Handler health via raw query for efficiency
    const handlerHealthRaw = await prisma.$queryRaw<{
      handler: string | null;
      open_count: bigint;
      breach_count: bigint;
      last_activity: Date | null;
    }[]>`
      SELECT
        handler,
        COUNT(*) FILTER (WHERE claim_status NOT IN ('Finalised', 'Cancelled', 'Repudiated')) AS open_count,
        COUNT(*) FILTER (WHERE is_sla_breach = true) AS breach_count,
        MAX(snapshot_date) AS last_activity
      FROM claim_snapshots
      WHERE snapshot_date = ${snapshotDate}
        AND handler IS NOT NULL
      GROUP BY handler
      ORDER BY open_count DESC
    `;

    const handlerHealth = handlerHealthRaw.map(r => ({
      handler: r.handler ?? '',
      openCount: Number(r.open_count),
      breachCount: Number(r.breach_count),
      lastActivity: r.last_activity ? r.last_activity.toISOString() : null,
    }));

    return NextResponse.json({
      alertCards: { slaBreaches, redFlags, bigClaimsOpen, unassignedWithPayment },
      attention: {
        uploadDate: latestRun?.createdAt.toISOString() ?? null,
        readyToClose,
        newlyBreached,
        valueJumps,
        stagnant,
      },
      handlerHealth,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
