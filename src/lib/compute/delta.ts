export function computeDelta(current: any, previous: any): string[] {
  if (!previous) return ['new_claim'];
  const flags: string[] = [];
  if (current.claimStatus !== previous.claimStatus) flags.push('status_change');
  if (current.secondaryStatus !== previous.secondaryStatus) flags.push('secondary_status_change');
  if (current.claimStatus === 'Re-opened' && previous.claimStatus !== 'Re-opened') flags.push('reopened');
  const prevIncurred = Number(previous.totalIncurred ?? 0);
  const currIncurred = Number(current.totalIncurred ?? 0);
  if (prevIncurred > 0 && currIncurred > prevIncurred * 1.2) flags.push('value_jump');
  if (current.claimStatus === 'Finalised' && previous.claimStatus !== 'Finalised') flags.push('finalised');
  return flags;
}
