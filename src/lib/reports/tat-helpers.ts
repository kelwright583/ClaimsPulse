/**
 * Shared TAT computation helpers.
 * Always compute breach/at-risk from secondaryStatus + daysInCurrentStatus
 * against the TAT matrix — never trust the stored isTatBreach field.
 */

export interface TatConfigEntry {
  secondaryStatus: string;
  maxDays: number;
  priority: string;
  isActive: boolean;
}

export type TatPosition = 'on-track' | 'at-risk' | 'breach';
export type TatStatus = 'BREACH' | 'AT RISK' | 'ON TRACK';

export function computeTatPosition(
  secondaryStatus: string | null,
  daysInCurrentStatus: number | null,
  tatMap: Map<string, TatConfigEntry>,
): TatPosition {
  const cfg = secondaryStatus ? tatMap.get(secondaryStatus) : undefined;
  if (!cfg) return 'on-track';
  const days = daysInCurrentStatus ?? 0;
  if (days > cfg.maxDays) return 'breach';
  if (days > cfg.maxDays * 0.8) return 'at-risk';
  return 'on-track';
}

export function computeTatBreach(
  secondaryStatus: string | null,
  daysInCurrentStatus: number | null,
  tatMap: Map<string, TatConfigEntry>,
): boolean {
  return computeTatPosition(secondaryStatus, daysInCurrentStatus, tatMap) === 'breach';
}

export function tatPositionToStatus(pos: TatPosition): TatStatus {
  if (pos === 'breach') return 'BREACH';
  if (pos === 'at-risk') return 'AT RISK';
  return 'ON TRACK';
}

export function priorityFromTat(
  secondaryStatus: string | null,
  daysInCurrentStatus: number | null,
  hasOverdueDelay: boolean,
  tatMap: Map<string, TatConfigEntry>,
): 'critical' | 'urgent' | 'standard' {
  const cfg = secondaryStatus ? tatMap.get(secondaryStatus) : undefined;
  const breach = computeTatBreach(secondaryStatus, daysInCurrentStatus, tatMap);
  if (breach && cfg?.priority === 'critical') return 'critical';
  if (breach || hasOverdueDelay) return 'urgent';
  return 'standard';
}
