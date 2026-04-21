/**
 * backfill-registration-dates.ts
 *
 * Propagates dateOfRegistration from the most recent snapshot where it is set
 * to ALL historical snapshots for the same claim, then recomputes daysOpen for
 * every snapshot row using:
 *   daysOpen = snapshot_date - dateOfRegistration  (preferred)
 *   daysOpen = snapshot_date - dateOfLoss          (fallback)
 *
 * Run once after the first successful CLAIMS_REGISTER import:
 *   pnpm run backfill:reg-dates
 *
 * Safe to re-run — only updates rows where the new value differs.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── Step 1: build a map of claimId → dateOfRegistration ──────────────────
  // Use the most recent snapshot that has dateOfRegistration set.
  console.log('Step 1: Reading dateOfRegistration values from all snapshots...');

  const withReg = await prisma.$queryRaw<{ claim_id: string; date_of_registration: Date }[]>`
    SELECT DISTINCT ON (claim_id)
      claim_id,
      date_of_registration
    FROM claim_snapshots
    WHERE date_of_registration IS NOT NULL
    ORDER BY claim_id, snapshot_date DESC
  `;

  console.log(`  Found dateOfRegistration for ${withReg.length} distinct claims.`);

  if (withReg.length === 0) {
    console.log('Nothing to backfill — run the CLAIMS_REGISTER import first.');
    return;
  }

  // ── Step 2: propagate dateOfRegistration to all historical snapshots ───────
  // One bulk UPDATE using a VALUES list.
  console.log('Step 2: Propagating dateOfRegistration to all historical snapshots...');

  const BATCH = 500;
  let regUpdated = 0;

  for (let i = 0; i < withReg.length; i += BATCH) {
    const batch = withReg.slice(i, i + BATCH);

    // Build a raw VALUES list: (claim_id, date_of_registration)
    const valuePlaceholders = batch
      .map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2}::date)`)
      .join(', ');
    const params = batch.flatMap(r => [r.claim_id, r.date_of_registration]);

    await prisma.$executeRawUnsafe(`
      UPDATE claim_snapshots AS cs
      SET date_of_registration = v.dor
      FROM (VALUES ${valuePlaceholders}) AS v(claim_id, dor)
      WHERE cs.claim_id = v.claim_id
        AND cs.date_of_registration IS DISTINCT FROM v.dor
    `, ...params);

    regUpdated += batch.length;
    process.stdout.write(`\r  Processed ${Math.min(regUpdated, withReg.length)} / ${withReg.length} claims...`);
  }

  console.log(`\n  Done. Updated registration dates across all snapshot dates.`);

  // ── Step 3: recompute daysOpen for every snapshot row ─────────────────────
  // daysOpen = snapshot_date - dateOfRegistration (preferred) or dateOfLoss.
  // Done entirely in SQL for performance — no row-by-row fetching.
  console.log('Step 3: Recomputing daysOpen for all snapshots...');

  await prisma.$executeRaw`
    UPDATE claim_snapshots
    SET days_open = GREATEST(0,
      (snapshot_date - COALESCE(date_of_registration, date_of_loss))::int
    )
    WHERE date_of_registration IS NOT NULL
       OR date_of_loss IS NOT NULL
  `;

  console.log('  Done. daysOpen recomputed for all snapshots.');

  // ── Step 4: summary ───────────────────────────────────────────────────────
  const stats = await prisma.$queryRaw<{
    total: bigint;
    with_reg: bigint;
    with_loss_only: bigint;
    neither: bigint;
  }[]>`
    SELECT
      COUNT(*)                                                          AS total,
      COUNT(*) FILTER (WHERE date_of_registration IS NOT NULL)         AS with_reg,
      COUNT(*) FILTER (WHERE date_of_registration IS NULL
                         AND date_of_loss IS NOT NULL)                 AS with_loss_only,
      COUNT(*) FILTER (WHERE date_of_registration IS NULL
                         AND date_of_loss IS NULL)                     AS neither
    FROM claim_snapshots
  `;

  const s = stats[0];
  console.log('\n── Summary ──────────────────────────────────────────');
  console.log(`  Total snapshots:               ${s.total}`);
  console.log(`  With dateOfRegistration:       ${s.with_reg}`);
  console.log(`  With dateOfLoss only:          ${s.with_loss_only}`);
  console.log(`  Neither (daysOpen = null):     ${s.neither}`);
  console.log('─────────────────────────────────────────────────────');
  console.log('Backfill complete.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
