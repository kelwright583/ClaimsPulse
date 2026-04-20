import { prisma } from '@/lib/prisma';
import { computeFlags } from '@/lib/compute/fraud-signals';

export async function recomputeImportsForward(fromDate: Date): Promise<void> {
  // Find all ImportRuns with periodStart > fromDate, oldest first
  const laterImports = await prisma.importRun.findMany({
    where: {
      reportType: 'CLAIMS_OUTSTANDING',
      periodStart: { gt: fromDate },
    },
    orderBy: { periodStart: 'asc' },
  });

  for (const importRun of laterImports) {
    if (!importRun.periodStart) continue;
    const snapshotDate = importRun.periodStart;

    // Recompute TAT breaches for this import's snapshots
    // This mirrors the compute logic from the import route
    // Get all TatConfig entries
    const tatConfigs = await (prisma as any).tatConfig.findMany({ where: { isActive: true } });
    const tatMap = new Map<string, number>(tatConfigs.map((c: any) => [c.secondaryStatus as string, c.maxDays as number]));

    // Get snapshots for this import
    const snapshots = await prisma.claimSnapshot.findMany({
      where: { importRunId: importRun.id },
      select: { id: true, secondaryStatus: true, daysInCurrentStatus: true },
    });

    // Update TAT breach status
    for (const snapshot of snapshots) {
      const maxDays = snapshot.secondaryStatus != null ? tatMap.get(snapshot.secondaryStatus) : undefined;
      const isTatBreach = maxDays != null && (snapshot.daysInCurrentStatus ?? 0) > maxDays;
      await prisma.claimSnapshot.update({
        where: { id: snapshot.id },
        data: { isTatBreach },
      });
    }

    // Recompute flags
    try {
      await computeFlags(importRun.id, snapshotDate);
    } catch (err) {
      console.error(`Flag recompute failed for import ${importRun.id}:`, err);
    }
  }
}
