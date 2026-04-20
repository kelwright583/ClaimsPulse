import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export async function recomputeClaimAges(claimIds: string[], snapshotDate: Date): Promise<void> {
  if (claimIds.length === 0) return;

  // Fetch current registration/loss dates for these claims at this snapshot date
  const snapshots = await prisma.claimSnapshot.findMany({
    where: { claimId: { in: claimIds }, snapshotDate },
    select: { claimId: true, dateOfRegistration: true, dateOfLoss: true },
  });

  if (snapshots.length === 0) return;

  const updates = snapshots.map(s => {
    const anchor = s.dateOfRegistration ?? s.dateOfLoss;
    const daysOpen = anchor
      ? Math.max(0, Math.floor((snapshotDate.getTime() - new Date(anchor).getTime()) / 86400000))
      : null;
    return { claimId: s.claimId, daysOpen };
  }).filter((u): u is { claimId: string; daysOpen: number } => u.daysOpen !== null);

  if (updates.length === 0) return;

  const BATCH = 500;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    const values = batch.map(u => Prisma.sql`(${u.claimId}, ${u.daysOpen})`);
    await prisma.$executeRaw`
      UPDATE claim_snapshots AS cs
      SET days_open = v.days_open::int
      FROM (VALUES ${Prisma.join(values)}) AS v(claim_id, days_open)
      WHERE cs.claim_id = v.claim_id
        AND cs.snapshot_date = ${snapshotDate}::date
    `;
  }
}
