export function computeDelta(current: any, previous: any): Record<string, boolean> {
  if (!previous) return { new_claim: true };
  const flags: Record<string, boolean> = {};
  if (current.claimStatus !== previous.claimStatus) flags.status_changed = true;
  if (current.secondaryStatus !== previous.secondaryStatus) flags.secondary_status_change = true;
  if (current.claimStatus === 'Re-opened' && previous.claimStatus !== 'Re-opened') flags.reopened = true;
  const prevIncurred = Number(previous.totalIncurred ?? 0);
  const currIncurred = Number(current.totalIncurred ?? 0);
  if (prevIncurred > 0 && currIncurred > prevIncurred * 1.2) flags.value_jump_20pct = true;
  if (current.claimStatus === 'Finalised' && previous.claimStatus !== 'Finalised') flags.finalised = true;
  return flags;
}
