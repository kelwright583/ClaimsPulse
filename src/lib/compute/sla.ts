export function computeSlaBreaches(snapshot: any, slaConfigs: any[], snapshotDate: Date): boolean {
  const status = snapshot.secondaryStatus || 'None';
  const config = slaConfigs.find(c => c.secondaryStatus === status);
  if (!config) return false;
  const days = snapshot.daysInCurrentStatus ?? 0;
  return days > config.maxDays;
}
