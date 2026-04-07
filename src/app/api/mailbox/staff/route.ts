import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const mailboxId = searchParams.get('mailboxId');
    if (!mailboxId) return Response.json({ error: 'mailboxId required' }, { status: 400 });

    const staff = await prisma.mailboxStaff.findMany({
      where: { mailboxId },
      orderBy: { roundRobinOrder: 'asc' },
    });
    return Response.json(staff);
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
      email: string;
      isTeamLeader?: boolean;
      isInRoundRobin?: boolean;
      roundRobinOrder?: number;
    };

    const staff = await prisma.mailboxStaff.create({
      data: {
        mailboxId: body.mailboxId,
        name: body.name,
        email: body.email,
        isTeamLeader: body.isTeamLeader ?? false,
        isInRoundRobin: body.isInRoundRobin ?? true,
        roundRobinOrder: body.roundRobinOrder ?? null,
      },
    });

    return Response.json(staff, { status: 201 });
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
      name?: string;
      email?: string;
      isTeamLeader?: boolean;
      isInRoundRobin?: boolean;
      roundRobinOrder?: number;
      active?: boolean;
    };

    const { id, ...data } = body;
    const staff = await prisma.mailboxStaff.update({ where: { id }, data });
    return Response.json(staff);
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

    await prisma.mailboxStaff.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
