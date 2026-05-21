import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import {
  computeHandlerMetrics,
  type HandlerSnapshot,
  type HandlerMetrics,
} from '@/lib/compute/productivity';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAuth();

    // Latest snapshot date
    const latest = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(snapshot_date) as max FROM claim_snapshots
    `;
    const maxDate = latest[0]?.max;

    if (!maxDate) {
      return Response.json({
        handlers: [],
        prevHandlers: [],
        snapshotDate: null,
        prevSnapshotDate: null,
        assessorPipeline: [],
        teamKpis: null,
        trend: [],
      });
    }

    const snapshotDate = maxDate instanceof Date ? maxDate : new Date(maxDate);

    // Team leader names to exclude
    const teamLeaders = await prisma.profile.findMany({
      where: { role: 'TEAM_LEADER' },
      select: { fullName: true },
    });
    const teamLeaderNames = new Set(
      teamLeaders.map(p => p.fullName).filter(Boolean) as string[],
    );

    // Current snapshots
    const snapshots = await prisma.claimSnapshot.findMany({
      where: { snapshotDate },
      select: {
        claimId: true,
        handler: true,
        claimStatus: true,
        secondaryStatus: true,
        cause: true,
        totalOs: true,
        deltaFlags: true,
        daysInCurrentStatus: true,
        complexityWeight: true,
      },
    });

    // Latest payee run for payment rate
    const latestPayeeRun = await prisma.importRun.findFirst({
      where: { reportType: 'PAYEE' },
      orderBy: { createdAt: 'desc' },
    });
    const paymentClaimIds = new Set<string>();
    if (latestPayeeRun) {
      const payments = await prisma.payment.findMany({
        where: { importRunId: latestPayeeRun.id },
        select: { claimId: true },
        distinct: ['claimId'],
      });
      for (const p of payments) paymentClaimIds.add(p.claimId);
    }

    // Build handler map and compute current metrics
    const handlerMap = new Map<string, HandlerSnapshot[]>();
    for (const s of snapshots) {
      const handler = s.handler?.trim() || 'Unassigned';
      if (!handlerMap.has(handler)) handlerMap.set(handler, []);
      handlerMap.get(handler)!.push({
        claimId: s.claimId,
        claimStatus: s.claimStatus,
        secondaryStatus: s.secondaryStatus,
        cause: s.cause,
        totalOs: Number(s.totalOs ?? 0),
        deltaFlags: (s.deltaFlags && typeof s.deltaFlags === 'object' && !Array.isArray(s.deltaFlags))
          ? s.deltaFlags as Record<string, boolean> : {},
        daysInCurrentStatus: s.daysInCurrentStatus,
        complexityWeight: s.complexityWeight,
      });
    }

    const handlers: HandlerMetrics[] = Array.from(handlerMap.entries())
      .filter(([handler]) => !teamLeaderNames.has(handler))
      .map(([handler, snaps]) => computeHandlerMetrics(handler, snaps, paymentClaimIds))
      .sort((a, b) => b.complexityScore - a.complexityScore);

    // Previous snapshot date + metrics for deltas
    const prevDateResult = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(snapshot_date) as max FROM claim_snapshots
      WHERE snapshot_date < ${snapshotDate}::date
    `;
    const prevRaw = prevDateResult[0]?.max;
    const prevDate = prevRaw ? (prevRaw instanceof Date ? prevRaw : new Date(prevRaw)) : null;

    let prevHandlers: HandlerMetrics[] = [];
    let prevSnapshotDate: string | null = null;

    if (prevDate) {
      prevSnapshotDate = prevDate.toISOString().split('T')[0];
      const prevSnapshots = await prisma.claimSnapshot.findMany({
        where: { snapshotDate: prevDate },
        select: {
          claimId: true,
          handler: true,
          claimStatus: true,
          secondaryStatus: true,
          cause: true,
          totalOs: true,
          deltaFlags: true,
          daysInCurrentStatus: true,
          complexityWeight: true,
        },
      });

      const prevHandlerMap = new Map<string, HandlerSnapshot[]>();
      for (const s of prevSnapshots) {
        const handler = s.handler?.trim() || 'Unassigned';
        if (!prevHandlerMap.has(handler)) prevHandlerMap.set(handler, []);
        prevHandlerMap.get(handler)!.push({
          claimId: s.claimId,
          claimStatus: s.claimStatus,
          secondaryStatus: s.secondaryStatus,
          cause: s.cause,
          totalOs: Number(s.totalOs ?? 0),
          deltaFlags: (s.deltaFlags && typeof s.deltaFlags === 'object' && !Array.isArray(s.deltaFlags))
            ? s.deltaFlags as Record<string, boolean> : {},
          daysInCurrentStatus: s.daysInCurrentStatus,
          complexityWeight: s.complexityWeight,
        });
      }

      prevHandlers = Array.from(prevHandlerMap.entries())
        .filter(([handler]) => !teamLeaderNames.has(handler))
        .map(([handler, snaps]) => computeHandlerMetrics(handler, snaps, paymentClaimIds));
    }

    // Team KPIs
    const totalOpen = handlers.reduce((s, h) => s + h.openClaims, 0);
    const prevTotalOpen = prevHandlers.length > 0
      ? prevHandlers.reduce((s, h) => s + h.openClaims, 0) : null;
    const avgFinalisationRate = handlers.length > 0
      ? handlers.reduce((s, h) => s + h.finalisationRate, 0) / handlers.length : 0;
    const prevAvgFinalisationRate = prevHandlers.length > 0
      ? prevHandlers.reduce((s, h) => s + h.finalisationRate, 0) / prevHandlers.length : null;
    const avgPaymentRate = handlers.length > 0
      ? handlers.reduce((s, h) => s + h.paymentRate, 0) / handlers.length : 0;
    const prevAvgPaymentRate = prevHandlers.length > 0
      ? prevHandlers.reduce((s, h) => s + h.paymentRate, 0) / prevHandlers.length : null;
    const newRegistrations = snapshots.filter(
      s => (s.deltaFlags as Record<string, boolean>)?.new_claim === true,
    ).length;
    const finalisedToday = snapshots.filter(
      s => (s.deltaFlags as Record<string, boolean>)?.finalised === true,
    ).length;
    const totalReserve = handlers.reduce((s, h) => s + h.openClaims * h.avgOsPerClaim, 0);
    const prevTotalReserve = prevHandlers.length > 0
      ? prevHandlers.reduce((s, h) => s + h.openClaims * h.avgOsPerClaim, 0) : null;
    const totalZeroActivity = Math.round(
      handlers.reduce((s, h) => s + (h.zeroActivityPct / 100) * h.openClaims, 0),
    );
    const prevTotalZeroActivity = prevHandlers.length > 0
      ? Math.round(prevHandlers.reduce((s, h) => s + (h.zeroActivityPct / 100) * h.openClaims, 0))
      : null;

    const teamKpis = {
      totalOpen,
      prevTotalOpen,
      avgFinalisationRate,
      prevAvgFinalisationRate,
      avgPaymentRate,
      prevAvgPaymentRate,
      newRegistrations,
      finalisedToday,
      totalReserve,
      prevTotalReserve,
      totalZeroActivity,
      prevTotalZeroActivity,
    };

    // Trend: last 8 snapshot dates, per-handler counts
    type TrendRow = {
      snapshot_date: Date;
      handler: string;
      open_count: bigint;
      new_count: bigint;
      finalised_count: bigint;
    };

    const trendRaw = await prisma.$queryRaw<TrendRow[]>`
      WITH recent_dates AS (
        SELECT DISTINCT snapshot_date FROM claim_snapshots ORDER BY snapshot_date DESC LIMIT 8
      )
      SELECT
        cs.snapshot_date,
        COALESCE(TRIM(cs.handler), 'Unassigned') as handler,
        COUNT(*) FILTER (WHERE cs.claim_status NOT IN ('Finalised', 'Cancelled', 'Repudiated')) as open_count,
        COUNT(*) FILTER (WHERE (cs.delta_flags->>'new_claim')::boolean IS TRUE) as new_count,
        COUNT(*) FILTER (WHERE (cs.delta_flags->>'finalised')::boolean IS TRUE) as finalised_count
      FROM claim_snapshots cs
      INNER JOIN recent_dates rd ON rd.snapshot_date = cs.snapshot_date
      GROUP BY cs.snapshot_date, COALESCE(TRIM(cs.handler), 'Unassigned')
      ORDER BY cs.snapshot_date ASC
    `;

    const trendGrouped = new Map<string, Map<string, { open: number; newClaims: number; finalised: number }>>();
    for (const row of trendRaw) {
      if (teamLeaderNames.has(row.handler)) continue;
      const dateStr = (row.snapshot_date instanceof Date ? row.snapshot_date : new Date(row.snapshot_date))
        .toISOString().split('T')[0];
      if (!trendGrouped.has(dateStr)) trendGrouped.set(dateStr, new Map());
      trendGrouped.get(dateStr)!.set(row.handler, {
        open: Number(row.open_count),
        newClaims: Number(row.new_count),
        finalised: Number(row.finalised_count),
      });
    }

    const trend = Array.from(trendGrouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, hMap]) => ({
        date,
        handlers: Array.from(hMap.entries()).map(([handler, counts]) => ({ handler, ...counts })),
      }));

    // Assessor pipeline
    const assessorPipeline = snapshots
      .filter(s => s.secondaryStatus === 'Assessor Appointed')
      .map(s => ({
        claimId: s.claimId,
        handler: s.handler ?? 'Unassigned',
        claimStatus: s.claimStatus,
        daysInCurrentStatus: s.daysInCurrentStatus ?? 0,
        totalOs: Number(s.totalOs ?? 0),
        cause: s.cause,
      }))
      .sort((a, b) => b.daysInCurrentStatus - a.daysInCurrentStatus);

    return Response.json({
      handlers,
      prevHandlers,
      snapshotDate: snapshotDate.toISOString().split('T')[0],
      prevSnapshotDate,
      assessorPipeline,
      teamKpis,
      trend,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
