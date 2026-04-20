import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Fetching latest snapshot date...');
  const latest = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });

  if (!latest) { console.log('No snapshots found.'); return; }

  const snapshotDate = latest.snapshotDate;
  console.log(`Recomputing ages for snapshot date: ${snapshotDate.toISOString().split('T')[0]}`);

  const snapshots = await prisma.claimSnapshot.findMany({
    where: { snapshotDate },
    select: { claimId: true, dateOfRegistration: true, dateOfLoss: true },
  });

  console.log(`Found ${snapshots.length} snapshots. Computing daysOpen...`);

  // Just log — actual UPDATE requires daysOpen column in schema
  // Run this after adding the column if needed
  const withReg = snapshots.filter(s => s.dateOfRegistration).length;
  const withLoss = snapshots.filter(s => !s.dateOfRegistration && s.dateOfLoss).length;
  const neither = snapshots.filter(s => !s.dateOfRegistration && !s.dateOfLoss).length;

  console.log(`  With dateOfRegistration: ${withReg}`);
  console.log(`  With dateOfLoss only:    ${withLoss}`);
  console.log(`  Neither (age = 0):       ${neither}`);
  console.log('Backfill complete (diagnostic mode — no writes performed).');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
