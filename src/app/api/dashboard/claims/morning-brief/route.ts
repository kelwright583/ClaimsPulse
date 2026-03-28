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
        alertCards: { slaBreaches: 0, unacknowledgedFlags: 0, partsOnBackorder: 0, bigClaimsOpen: 0, unassignedWithPayment: 0 },
        delta: { uploadDate: null, statusChanges: 0, valueJumps: 0, reopened: 0, newlyStale: 0, newPayments: 0, finalised: 0 },
        handlerHealth: [],
        partsBackorder: [],
      });
    }

    const snapshotDate = latestDate;

    const [slaBreaches, partsOnBackorder, bigClaimsOpen, unacknowledgedFlags, unassignedWithPayment] = await Promise.all([
      prisma.claimSnapshot.count({ where: { snapshotDate, isSlaBreach: true } }),
      prisma.claimSnapshot.count({ where: { snapshotDate, secondaryStatus: 'Vehicle repair - Parts on Back Order' } }),
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

    const latestRun = await prisma.importRun.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, id: true },
    });

    // Previous snapshot date for finalised delta
    const prevSnap = await prisma.claimSnapshot.findFirst({
      where: { snapshotDate: { lt: snapshotDate } },
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    });
    const prevDate = prevSnap?.snapshotDate ?? null;

    // Delta flags from latest snapshot
    const deltaSnapshots = await prisma.claimSnapshot.findMany({
      where: { snapshotDate, deltaFlags: { not: undefined } },
      select: { deltaFlags: true, daysInCurrentStatus: true, claimStatus: true },
    });

    let statusChanges = 0, valueJumps = 0, reopened = 0, newlyStale = 0;
    for (const s of deltaSnapshots) {
      const flags = s.deltaFlags as Record<string, unknown> | null;
      if (!flags) continue;
      if (flags['status_changed']) statusChanges++;
      if (flags['value_jump_20pct']) valueJumps++;
      if (flags['reopened']) reopened++;
      if (flags['newly_stale']) newlyStale++;
    }

    // Finalised: claims finalised in latest snapshot that weren't in previous
    let finalised = 0;
    if (prevDate) {
      const [finalisedLatest, finalisedPrev] = await Promise.all([
        prisma.claimSnapshot.findMany({
          where: { snapshotDate, claimStatus: 'Finalised' },
          select: { claimId: true },
        }),
        prisma.claimSnapshot.findMany({
          where: { snapshotDate: prevDate, claimStatus: 'Finalised' },
          select: { claimId: true },
        }),
      ]);
      const prevSet = new Set(finalisedPrev.map(r => r.claimId));
      finalised = finalisedLatest.filter(r => !prevSet.has(r.claimId)).length;
    }

    const newPayments = latestRun
      ? await prisma.payment.count({ where: { importRunId: latestRun.id } })
      : 0;

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

    // Parts on backorder
    const partsRows = await prisma.claimSnapshot.findMany({
      where: { snapshotDate, secondaryStatus: 'Vehicle repair - Parts on Back Order' },
      select: { claimId: true, insured: true, handler: true, daysInCurrentStatus: true },
      take: 50,
    });

    const partsClaimIds = partsRows.map(r => r.claimId);
    const activeDelays = partsClaimIds.length > 0
      ? await prisma.acknowledgedDelay.findMany({
          where: { claimId: { in: partsClaimIds }, isActive: true },
          select: { claimId: true, expectedDate: true },
        })
      : [];
    const delayMap = new Map(activeDelays.map(d => [d.claimId, d.expectedDate]));

    const partsBackorder = partsRows.map(r => ({
      claimId: r.claimId,
      insured: r.insured,
      handler: r.handler,
      daysInStatus: r.daysInCurrentStatus,
      hasAcknowledgedDelay: delayMap.has(r.claimId),
      expectedDate: delayMap.get(r.claimId)?.toISOString().split('T')[0] ?? null,
    }));

    return NextResponse.json({
      alertCards: { slaBreaches, unacknowledgedFlags, partsOnBackorder, bigClaimsOpen, unassignedWithPayment },
      delta: {
        uploadDate: latestRun?.createdAt.toISOString() ?? null,
        statusChanges,
        valueJumps,
        reopened,
        newlyStale,
        newPayments,
        finalised,
      },
      handlerHealth,
      partsBackorder,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
