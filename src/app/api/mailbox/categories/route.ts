import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const mailboxId = searchParams.get('mailboxId');
    if (!mailboxId) return Response.json({ error: 'mailboxId required' }, { status: 400 });

    const categories = await prisma.routingCategory.findMany({
      where: { mailboxId },
      orderBy: { displayOrder: 'asc' },
    });
    return Response.json(categories);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = await request.json() as {
      mailboxId: string;
      name: string;
      description?: string;
      colour?: string;
      displayOrder?: number;
    };

    const category = await prisma.routingCategory.create({
      data: {
        mailboxId: body.mailboxId,
        name: body.name,
        description: body.description ?? null,
        colour: body.colour ?? '#6B7280',
        displayOrder: body.displayOrder ?? 0,
      },
    });

    return Response.json(category, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });

    await prisma.routingCategory.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
