import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAuth();
    const configs = await prisma.mailboxConfig.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return Response.json(configs);
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
      departmentName: string;
      mailboxAddress: string;
      classificationInstructions?: string;
      urgentKeywords?: string[];
    };

    const config = await prisma.mailboxConfig.create({
      data: {
        departmentName: body.departmentName,
        mailboxAddress: body.mailboxAddress,
        classificationInstructions: body.classificationInstructions ?? null,
        urgentKeywords: body.urgentKeywords ?? [],
      },
    });

    return Response.json(config, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAuth();
    const body = await request.json() as {
      id: string;
      departmentName?: string;
      mailboxAddress?: string;
      classificationInstructions?: string;
      urgentKeywords?: string[];
      active?: boolean;
      isConfigured?: boolean;
    };

    const { id, ...data } = body;

    const config = await prisma.mailboxConfig.update({
      where: { id },
      data,
    });

    return Response.json(config);
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

    await prisma.mailboxConfig.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
