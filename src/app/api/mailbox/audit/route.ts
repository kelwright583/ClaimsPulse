import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);

    const mailboxId = searchParams.get('mailboxId');
    const categoryName = searchParams.get('categoryName');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const urgentOnly = searchParams.get('urgent') === 'true';
    const limit = Math.min(500, parseInt(searchParams.get('limit') ?? '100', 10));

    const where: Prisma.MailboxAuditLogWhereInput = {};

    if (mailboxId) where.mailboxId = mailboxId;
    if (categoryName) where.categoryName = categoryName;
    if (urgentOnly) where.urgent = true;
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    const logs = await prisma.mailboxAuditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return Response.json(logs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
