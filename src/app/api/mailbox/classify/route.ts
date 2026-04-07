import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { classifyEmail } from '@/lib/mailbox/classifier';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = await request.json() as {
      subject: string;
      body: string;
      from: string;
      mailboxId: string;
    };

    const mailbox = await prisma.mailboxConfig.findUnique({
      where: { id: body.mailboxId },
      include: { categories: true },
    });

    if (!mailbox) return Response.json({ error: 'Mailbox not found' }, { status: 404 });

    const result = await classifyEmail({
      subject: body.subject,
      body: body.body,
      from: body.from,
      categories: mailbox.categories,
      urgentKeywords: mailbox.urgentKeywords,
      classificationInstructions: mailbox.classificationInstructions,
    });

    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
