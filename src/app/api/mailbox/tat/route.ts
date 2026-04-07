import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { checkTatBreaches } from '@/lib/mailbox/tat-monitor';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAuth();
    const breached = await checkTatBreaches();
    return Response.json(breached);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = await request.json() as { emailRecordId: string };

    const updated = await prisma.emailRecord.update({
      where: { id: body.emailRecordId },
      data: {
        respondedTo: true,
        respondedAt: new Date(),
      },
    });

    return Response.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
