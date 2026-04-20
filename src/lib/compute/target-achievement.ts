import { prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export interface TargetAchievement {
  handler: string;
  metricType: string;
  label: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  unit: 'count' | 'pct' | 'ratio';
  targetValue: number | null;
  actualValue: number;
  achievementPct: number;
  status: 'on_track' | 'at_risk' | 'off_track';
  trend: number[];
}

const INVERTED_METRICS = new Set(['zero_activity_pct']);

export async function computeTargetAchievement(handler?: string): Promise<TargetAchievement[]> {
  // Get latest snapshot date
  const latest = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });

  if (!latest) return [];

  const snapshotDate = latest.snapshotDate;
  const today = snapshotDate;

  // Fetch active metric configs
  const configs = await db.targetMetricConfig.findMany({
    where: { isActive: true },
  });

  if (configs.length === 0) return [];

  // Fetch handler targets
  const handlerTargets = await db.handlerTarget.findMany({
    where: handler ? { handler } : undefined,
  });

  if (handlerTargets.length === 0) return [];

  // Get all unique handlers from targets
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers: string[] = handler ? [handler] : [...new Set<string>(handlerTargets.map((t: any) => t.handler as string))];

  const results: TargetAchievement[] = [];

  for (const h of handlers) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hTargets = handlerTargets.filter((t: any) => t.handler === h);

    // Fetch snapshots for this handler at latest date
    const snapshots = await prisma.claimSnapshot.findMany({
      where: { handler: h, snapshotDate: today },
      select: {
        claimId: true,
        claimStatus: true,
        isTatBreach: true,
        daysInCurrentStatus: true,
        dateOfRegistration: true,
      },
    });

    const openSnapshots = snapshots.filter(s => !s.claimStatus?.toLowerCase().includes('finalised'));
    const finalisedSnapshots = snapshots.filter(s => s.claimStatus?.toLowerCase().includes('finalised'));
    const totalOpen = openSnapshots.length;

    for (const target of hTargets) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = configs.find((c: any) => c.metricType === target.metricType);
      if (!cfg) continue;

      let actualValue = 0;

      switch (target.metricType) {
        case 'daily_claims_registered': {
          // Count claims registered today
          actualValue = snapshots.filter(s => {
            if (!s.dateOfRegistration) return false;
            const d = new Date(s.dateOfRegistration);
            return d.toISOString().split('T')[0] === today.toISOString().split('T')[0];
          }).length;
          break;
        }
        case 'daily_claims_finalised': {
          actualValue = finalisedSnapshots.length;
          break;
        }
        case 'pct_open_finalised': {
          const total = snapshots.length;
          actualValue = total > 0 ? (finalisedSnapshots.length / total) * 100 : 0;
          break;
        }
        case 'zero_activity_pct': {
          if (totalOpen === 0) { actualValue = 0; break; }
          const zeroActivity = openSnapshots.filter(s => (s.daysInCurrentStatus ?? 0) > 7).length;
          actualValue = (zeroActivity / totalOpen) * 100;
          break;
        }
        case 'tat_compliance_pct': {
          if (totalOpen === 0) { actualValue = 100; break; }
          const compliant = openSnapshots.filter(s => !s.isTatBreach).length;
          actualValue = (compliant / totalOpen) * 100;
          break;
        }
        default:
          actualValue = 0;
      }

      const targetVal = Number(target.targetValue);
      const isInverted = INVERTED_METRICS.has(target.metricType);

      let achievementPct: number;
      if (isInverted) {
        // Lower is better — achievement = targetVal / actual (if actual > 0)
        achievementPct = actualValue === 0 ? 200 : Math.min((targetVal / actualValue) * 100, 200);
      } else {
        achievementPct = targetVal === 0 ? 0 : Math.min((actualValue / targetVal) * 100, 200);
      }

      achievementPct = Math.max(0, achievementPct);

      let status: 'on_track' | 'at_risk' | 'off_track';
      if (achievementPct >= 100) status = 'on_track';
      else if (achievementPct >= 70) status = 'at_risk';
      else status = 'off_track';

      results.push({
        handler: h,
        metricType: target.metricType,
        label: cfg.label,
        cadence: cfg.cadence as 'daily' | 'weekly' | 'monthly',
        unit: cfg.unit as 'count' | 'pct' | 'ratio',
        targetValue: targetVal,
        actualValue: Math.round(actualValue * 100) / 100,
        achievementPct: Math.round(achievementPct * 10) / 10,
        status,
        trend: [],
      });
    }
  }

  return results;
}
