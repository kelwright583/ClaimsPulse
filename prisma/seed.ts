import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

const SLA_SEED = [
  { secondaryStatus: 'Repair Authorisation Pending Approval from Broker', maxDays: 1, alertRole: 'handler', priority: 'critical' },
  { secondaryStatus: 'Problematic Claim - Escalated to Management', maxDays: 2, alertRole: 'head_of_claims', priority: 'critical' },
  { secondaryStatus: 'Authorisation Pending Approval from Management', maxDays: 2, alertRole: 'both', priority: 'critical' },
  { secondaryStatus: 'Signed AOL NOT received', maxDays: 2, alertRole: 'head_of_claims', priority: 'critical' },
  { secondaryStatus: 'Validations Documentation Outstanding', maxDays: 2, alertRole: 'handler', priority: 'critical' },
  { secondaryStatus: 'Signed AOL received - Awaiting supporting document', maxDays: 2, alertRole: 'handler', priority: 'urgent' },
  { secondaryStatus: 'Assessor Appointed', maxDays: 3, alertRole: 'handler', priority: 'urgent' },
  { secondaryStatus: 'Possible Rejection - Claim Under Review', maxDays: 5, alertRole: 'head_of_claims', priority: 'urgent' },
  { secondaryStatus: 'Premium Outstanding - Possible Rejection', maxDays: 5, alertRole: 'head_of_claims', priority: 'urgent' },
  { secondaryStatus: 'Investigator Appointed', maxDays: 7, alertRole: 'head_of_claims', priority: 'urgent' },
  { secondaryStatus: 'Claim Authorised, Awaiting Repair Invoice', maxDays: 14, alertRole: 'handler', priority: 'standard' },
  { secondaryStatus: 'Vehicle repair - WIP', maxDays: 14, alertRole: 'handler', priority: 'standard' },
  { secondaryStatus: 'Vehicle repair - Parts on Back Order', maxDays: 14, alertRole: 'head_of_claims', priority: 'standard' },
  { secondaryStatus: 'Repair Completed - Awaiting Invoice', maxDays: 14, alertRole: 'handler', priority: 'standard' },
  { secondaryStatus: 'Salvage Recovery in Process', maxDays: 30, alertRole: 'both', priority: 'standard' },
  { secondaryStatus: 'Own damage claim finalised, TP claim in Process', maxDays: 60, alertRole: 'tp_handler', priority: 'standard' },
  { secondaryStatus: 'None', maxDays: 3, alertRole: 'head_of_claims', priority: 'urgent' },
];

async function main() {
  console.log('Seeding SLA config...');

  for (const entry of SLA_SEED) {
    await prisma.slaConfig.upsert({
      where: { secondaryStatus: entry.secondaryStatus },
      update: {},
      create: entry,
    });
  }

  console.log(`Seeded ${SLA_SEED.length} SLA config entries.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
