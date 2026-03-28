import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function num(v: unknown) { return Number(v ?? 0); }

export async function GET() {
  try {
    await requireAuth();

    // Latest snapshot date
    const latest = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(snapshot_date) as max FROM claim_snapshots
    `;
    const maxDate = latest[0]?.max;

    // All premium records (grouped by period and broker/class)
    const [premiumRecords, financialSummaries, latestSnapshots] = await Promise.all([
      prisma.premiumRecord.findMany({
        orderBy: { periodDate: 'asc' },
        select: {
          month: true,
          periodDate: true,
          className: true,
          broker: true,
          gwp: true,
          netWp: true,
          quotaShareWp: true,
          grossComm: true,
          netComm: true,
        },
      }),
      prisma.financialSummary.findMany({
        orderBy: { periodDate: 'asc' },
        select: {
          period: true,
          periodDate: true,
          section: true,
          level: true,
          metric: true,
          value: true,
        },
      }),
      // Latest snapshot data for current incurred (when no movement data)
      maxDate
        ? prisma.claimSnapshot.findMany({
            where: { snapshotDate: maxDate instanceof Date ? maxDate : new Date(maxDate) },
            select: {
              broker: true,
              cause: true,
              claimStatus: true,
              totalIncurred: true,
              totalOs: true,
            },
          })
        : Promise.resolve([]),
    ]);

    // ── Premium aggregation by period ────────────────────────────────────────
    const premiumByPeriod = new Map<string, {
      period: string;
      periodDate: string;
      totalGwp: number;
      totalNetWp: number;
      totalNetComm: number;
    }>();

    for (const r of premiumRecords) {
      const key = r.periodDate.toISOString().split('T')[0];
      if (!premiumByPeriod.has(key)) {
        premiumByPeriod.set(key, {
          period: r.month,
          periodDate: key,
          totalGwp: 0,
          totalNetWp: 0,
          totalNetComm: 0,
        });
      }
      const p = premiumByPeriod.get(key)!;
      p.totalGwp += num(r.gwp);
      p.totalNetWp += num(r.netWp);
      p.totalNetComm += num(r.netComm);
    }

    // ── Premium by broker ────────────────────────────────────────────────────
    const premiumByBroker = new Map<string, { gwp: number; netWp: number; netComm: number }>();
    for (const r of premiumRecords) {
      const broker = r.broker?.trim() || 'Unknown';
      if (!premiumByBroker.has(broker)) premiumByBroker.set(broker, { gwp: 0, netWp: 0, netComm: 0 });
      const b = premiumByBroker.get(broker)!;
      b.gwp += num(r.gwp);
      b.netWp += num(r.netWp);
      b.netComm += num(r.netComm);
    }

    // ── Premium by class ─────────────────────────────────────────────────────
    const premiumByClass = new Map<string, { gwp: number; netWp: number }>();
    for (const r of premiumRecords) {
      const cls = r.className?.trim() || 'Unknown';
      if (!premiumByClass.has(cls)) premiumByClass.set(cls, { gwp: 0, netWp: 0 });
      const c = premiumByClass.get(cls)!;
      c.gwp += num(r.gwp);
      c.netWp += num(r.netWp);
    }

    // ── Claims incurred from latest snapshots ────────────────────────────────
    const CLOSED = new Set(['Repudiated', 'Cancelled']);
    const incurredByBroker = new Map<string, number>();
    let totalIncurred = 0;
    let totalOs = 0;

    for (const s of latestSnapshots) {
      if (CLOSED.has(s.claimStatus ?? '')) continue;
      const broker = s.broker?.trim() || 'Unknown';
      const inc = num(s.totalIncurred);
      incurredByBroker.set(broker, (incurredByBroker.get(broker) ?? 0) + inc);
      totalIncurred += inc;
      totalOs += num(s.totalOs);
    }

    // ── Financial summaries (from movement report imports) ───────────────────
    const summaryMap = new Map<string, number>();
    for (const s of financialSummaries) {
      const key = `${s.periodDate.toISOString().split('T')[0]}|${s.section}|${s.level}|${s.metric}`;
      summaryMap.set(key, num(s.value));
    }

    // Get the latest period's data from financial summaries
    const latestPeriodDate = financialSummaries.length > 0
      ? financialSummaries[financialSummaries.length - 1].periodDate.toISOString().split('T')[0]
      : null;

    function getSummary(section: string, level: string, metric: string, periodDate: string | null) {
      if (!periodDate) return 0;
      return summaryMap.get(`${periodDate}|${section}|${level}|${metric}`) ?? 0;
    }

    const totalNetWp = Array.from(premiumByPeriod.values()).reduce((s, p) => s + p.totalNetWp, 0);
    const totalGwp = Array.from(premiumByPeriod.values()).reduce((s, p) => s + p.totalGwp, 0);

    // Loss ratio: claims incurred / net WP (from premium records)
    // If movement data available, use movement incurred instead
    const movementIncurred = latestPeriodDate
      ? getSummary('claims', 'net', 'incurred', latestPeriodDate)
      : 0;
    const effectiveIncurred = movementIncurred !== 0 ? movementIncurred : totalIncurred;
    const lossRatio = totalNetWp > 0 ? (effectiveIncurred / totalNetWp) * 100 : null;

    // UW result from summaries
    const uwResultNet = latestPeriodDate
      ? getSummary('uw_result', 'net', 'uw_result', latestPeriodDate)
      : 0;
    const uwResultGross = latestPeriodDate
      ? getSummary('uw_result', 'gross', 'uw_result', latestPeriodDate)
      : 0;

    // IBNR from summaries
    const ibnrOpen = latestPeriodDate ? getSummary('claims', 'net', 'ibnr_open', latestPeriodDate) : 0;
    const ibnrClose = latestPeriodDate ? getSummary('claims', 'net', 'ibnr_close', latestPeriodDate) : 0;
    const ibnrMovement = latestPeriodDate ? getSummary('claims', 'net', 'ibnr_movement', latestPeriodDate) : 0;

    // ── Periods timeline ─────────────────────────────────────────────────────
    const periods = Array.from(premiumByPeriod.values()).map(p => {
      const inc = getSummary('claims', 'net', 'incurred', p.periodDate) || 0;
      const lr = p.totalNetWp > 0 ? (inc / p.totalNetWp) * 100 : null;
      return { ...p, incurred: inc, lossRatio: lr };
    });

    // ── Broker performance ───────────────────────────────────────────────────
    const brokerPerformance = Array.from(premiumByBroker.entries()).map(([broker, prem]) => ({
      broker,
      gwp: prem.gwp,
      netWp: prem.netWp,
      netComm: prem.netComm,
      incurred: incurredByBroker.get(broker) ?? 0,
      lossRatio: prem.netWp > 0 ? ((incurredByBroker.get(broker) ?? 0) / prem.netWp) * 100 : null,
      commPct: prem.gwp > 0 ? (prem.netComm / prem.gwp) * 100 : null,
    })).sort((a, b) => b.gwp - a.gwp);

    // ── Class breakdown ──────────────────────────────────────────────────────
    const classBreakdown = Array.from(premiumByClass.entries()).map(([cls, prem]) => ({
      className: cls,
      gwp: prem.gwp,
      netWp: prem.netWp,
    })).sort((a, b) => b.gwp - a.gwp);

    return Response.json({
      summary: {
        totalGwp,
        totalNetWp,
        totalIncurred: effectiveIncurred,
        totalOs,
        lossRatio,
        uwResultNet,
        uwResultGross,
        ibnrOpen,
        ibnrClose,
        ibnrMovement,
        hasMovementData: financialSummaries.length > 0,
        hasPremiumData: premiumRecords.length > 0,
      },
      periods,
      brokerPerformance,
      classBreakdown,
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
