import { prisma } from '@/lib/prisma';

export interface TatBreachRecord {
  id: string;
  mailboxId: string;
  graphEmailId: string;
  subject: string | null;
  categoryName: string | null;
  senderType: string | null;
  assignedToEmail: string | null;
  receivedAt: Date;
  tatDeadline: Date;
  claimId: string | null;
  overdueMinutes: number;
}

export async function checkTatBreaches(): Promise<TatBreachRecord[]> {
  const now = new Date();

  const breached = await prisma.emailRecord.findMany({
    where: {
      respondedTo: false,
      tatDeadline: { lt: now },
    },
    orderBy: { tatDeadline: 'asc' },
  });

  return breached.map(r => ({
    id: r.id,
    mailboxId: r.mailboxId,
    graphEmailId: r.graphEmailId,
    subject: r.subject,
    categoryName: r.categoryName,
    senderType: r.senderType,
    assignedToEmail: r.assignedToEmail,
    receivedAt: r.receivedAt,
    tatDeadline: r.tatDeadline,
    claimId: r.claimId,
    overdueMinutes: Math.floor((now.getTime() - r.tatDeadline.getTime()) / 60000),
  }));
}
