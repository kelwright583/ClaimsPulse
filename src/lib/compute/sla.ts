export function computeTatBreaches(snapshot: any, tatConfigs: any[], snapshotDate: Date): boolean {
  const status = snapshot.secondaryStatus || 'None';
  const config = tatConfigs.find(c => c.secondaryStatus === status);
  if (!config) return false;
  const days = snapshot.daysInCurrentStatus ?? 0;
  return days > config.maxDays;
}
