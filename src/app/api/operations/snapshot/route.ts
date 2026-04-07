export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const generatedAt = new Date().toISOString();

    const latestSnap = await prisma.claimSnapshot.findFirst({
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    });
    const snapshotDate = latestSnap?.snapshotDate ?? null;

    const [openCount, slaBreaches, partsBackorder, bigClaims, totalOs, recentFinalised] = snapshotDate
      ? await Promise.all([
          prisma.claimSnapshot.count({
            where: { snapshotDate, claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] } },
          }),
          prisma.claimSnapshot.count({ where: { snapshotDate, isSlaBreach: true } }),
          prisma.claimSnapshot.count({
            where: { snapshotDate, secondaryStatus: 'Vehicle repair - Parts on Back Order' },
          }),
          prisma.claimSnapshot.count({
            where: { snapshotDate, totalIncurred: { gt: 250000 }, claimStatus: { notIn: ['Finalised', 'Cancelled'] } },
          }),
          prisma.claimSnapshot.aggregate({ where: { snapshotDate }, _sum: { totalOs: true } }),
          prisma.claimSnapshot.count({
            where: { snapshotDate, claimStatus: 'Finalised', deltaFlags: { path: ['finalised'], equals: true } },
          }),
        ])
      : [0, 0, 0, 0, { _sum: { totalOs: 0 } }, 0];

    const yesterday = new Date(Date.now() - 86400000);
    const [recentPaymentCount, recentPaymentTotal] = await Promise.all([
      prisma.payment.count({ where: { printedDate: { gte: yesterday } } }),
      prisma.payment.aggregate({
        where: { printedDate: { gte: yesterday } },
        _sum: { grossPaidInclVat: true },
      }),
    ]);

    const [emailsRouted, tatBreaches, urgentPending] = await Promise.all([
      prisma.emailRecord.count({ where: { receivedAt: { gte: yesterday } } }),
      prisma.emailRecord.count({
        where: { respondedTo: false, tatDeadline: { lt: new Date() } },
      }),
      prisma.emailRecord.count({ where: { urgent: true, respondedTo: false } }),
    ]);

    const latestPremium = await prisma.premiumRecord.findFirst({
      orderBy: { periodDate: 'desc' },
      select: { periodDate: true },
    });
    let lossRatio: number | null = null;
    if (latestPremium && snapshotDate) {
      const [inc, prem] = await Promise.all([
        prisma.claimSnapshot.aggregate({ where: { snapshotDate }, _sum: { totalIncurred: true } }),
        prisma.premiumRecord.aggregate({
          where: { periodDate: latestPremium.periodDate, endorsementType: { in: ['Renewal', 'New Business'] } },
          _sum: { netWp: true },
        }),
      ]);
      const i = Number(inc._sum.totalIncurred ?? 0);
      const p = Number(prem._sum.netWp ?? 0);
      if (p > 0) lossRatio = Math.round((i / p) * 1000) / 10;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today.getTime() + 7 * 86400000);

    const [activeProjects, overdueMs, dueSoonMs] = await Promise.all([
      prisma.project.count({ where: { status: { in: ['ACTIVE', 'PLANNING', 'BLOCKED'] } } }),
      prisma.projectMilestone.findMany({
        where: { isComplete: false, dueDate: { lt: today } },
        include: { project: { select: { title: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.projectMilestone.findMany({
        where: { isComplete: false, dueDate: { gte: today, lte: nextWeek } },
        include: { project: { select: { title: true } } },
        orderBy: { dueDate: 'asc' },
      }),
    ]);

    return NextResponse.json({
      generatedAt,
      snapshotDate: snapshotDate?.toISOString() ?? null,
      claims: {
        openCount,
        slaBreaches,
        partsBackorder,
        bigClaims,
        totalOutstanding: Number((totalOs as { _sum: { totalOs?: number | null } })._sum?.totalOs ?? 0),
        finalisedToday: recentFinalised,
      },
      payments: {
        count: recentPaymentCount,
        totalValue: Number(recentPaymentTotal._sum.grossPaidInclVat ?? 0),
      },
      mailbox: { emailsRouted, tatBreaches, urgentPending },
      finance: { lossRatio },
      operations: {
        activeProjects,
        overdueMilestones: overdueMs.map(m => ({
          title: m.title,
          projectTitle: m.project.title,
          dueDate: m.dueDate,
          daysOverdue: Math.floor((today.getTime() - new Date(m.dueDate).getTime()) / 86400000),
        })),
        dueSoonMilestones: dueSoonMs.map(m => ({
          title: m.title,
          projectTitle: m.project.title,
          dueDate: m.dueDate,
          daysUntilDue: Math.floor((new Date(m.dueDate).getTime() - today.getTime()) / 86400000),
        })),
      },
    });
  } catch (err) {
    console.error('[operations/snapshot GET]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
