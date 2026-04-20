import { prisma } from '@/lib/prisma';
import type { DailyHandlerReportData } from './daily-handler-pdf';
import { computeTargetAchievement } from '@/lib/compute/target-achievement';

export async function fetchDailyHandlerReportData(handler: string): Promise<DailyHandlerReportData> {
  // Get latest snapshot date
  const latestSnapshot = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true, importRunId: true },
  });
  const snapshotDate = latestSnapshot
    ? new Date(latestSnapshot.snapshotDate).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  // Get snapshots for this handler
  const snapshots = await prisma.claimSnapshot.findMany({
    where: {
      handler,
      snapshotDate: latestSnapshot ? latestSnapshot.snapshotDate : new Date(),
    },
    select: {
      claimId: true,
      claimStatus: true,
      totalIncurred: true,
      totalOs: true,
      isTatBreach: true,
      daysInCurrentStatus: true,
      secondaryStatus: true,
    },
  });

  const open = snapshots.filter(s => !s.claimStatus?.toLowerCase().includes('finalised'));
  const finalised = snapshots.filter(s => s.claimStatus?.toLowerCase().includes('finalised'));
  const avgOs = open.length > 0
    ? open.reduce((sum, s) => sum + Number(s.totalOs ?? 0), 0) / open.length
    : 0;

  // Get flags from the latest import run
  const importRunId = latestSnapshot?.importRunId ?? '';
  const flags = importRunId
    ? await prisma.claimFlag.findMany({
        where: { importRunId },
        select: { claimId: true, flagType: true, severity: true },
        take: 20,
      })
    : [];

  // Get target achievements for this handler
  const achievements = await computeTargetAchievement(handler);
  const overallScore = achievements.length > 0
    ? Math.round(achievements.reduce((sum, a) => sum + Math.min(a.achievementPct, 100), 0) / achievements.length)
    : 0;
  const status: 'on_track' | 'at_risk' | 'off_track' =
    overallScore >= 100 ? 'on_track' : overallScore >= 70 ? 'at_risk' : 'off_track';

  const metrics = achievements.map(a => ({
    label: a.label,
    actual: a.actualValue,
    target: a.targetValue ?? 0,
    unit: a.unit,
    trend: 'flat' as const,
  }));

  // Focus areas: top 3 by daysInCurrentStatus
  const focusAreas = open
    .sort((a, b) => (b.daysInCurrentStatus ?? 0) - (a.daysInCurrentStatus ?? 0))
    .slice(0, 3)
    .map(s => ({
      claimId: s.claimId,
      reason: s.isTatBreach ? 'TAT breach' : `${s.daysInCurrentStatus ?? 0} days in status`,
      daysInStatus: s.daysInCurrentStatus ?? 0,
      totalOs: Number(s.totalOs ?? 0),
    }));

  const wins: Array<{ label: string; note: string }> = [];
  if (finalised.length > 0) wins.push({ label: 'Claims finalised', note: `${finalised.length} claims closed` });
  if (overallScore >= 100) wins.push({ label: 'On track', note: 'All targets met' });

  return {
    handler,
    snapshotDate,
    role: 'Claims Technician',
    overallScore,
    status,
    metrics,
    portfolio: { open: open.length, finalised: finalised.length, avgOs, complexityWeight: open.length },
    focusAreas,
    flags: flags.map(f => ({ claimId: f.claimId, flagType: f.flagType, severity: f.severity })),
    wins,
  };
}
