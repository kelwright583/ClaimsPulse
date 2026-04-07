import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { graphClient } from '@/lib/mailbox/graph-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAuth();

    const now = new Date();

    const [recentActivity, pendingTat, totalProcessed, pendingResponse, tatBreaches, urgentPending, configCount] =
      await Promise.all([
        prisma.mailboxAuditLog.findMany({
          orderBy: { timestamp: 'desc' },
          take: 50,
        }),
        prisma.emailRecord.findMany({
          where: { respondedTo: false, tatDeadline: { lt: now } },
          orderBy: { tatDeadline: 'asc' },
        }),
        prisma.emailRecord.count(),
        prisma.emailRecord.count({ where: { respondedTo: false } }),
        prisma.emailRecord.count({ where: { respondedTo: false, tatDeadline: { lt: now } } }),
        prisma.emailRecord.count({ where: { urgent: true, respondedTo: false } }),
        prisma.mailboxConfig.count({ where: { active: true, isConfigured: true } }),
      ]);

    return Response.json({
      recentActivity,
      pendingTat,
      stats: {
        totalProcessed,
        pendingResponse,
        tatBreaches,
        urgentPending,
      },
      isConfigured: configCount > 0,
      isStubMode: graphClient.isStubMode(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
