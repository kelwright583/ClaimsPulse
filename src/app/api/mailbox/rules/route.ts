import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const mailboxId = searchParams.get('mailboxId');
    if (!mailboxId) return Response.json({ error: 'mailboxId required' }, { status: 400 });

    const rules = await prisma.routingRule.findMany({
      where: { mailboxId },
    });
    return Response.json(rules);
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
      categoryId: string;
      categoryName: string;
      destinationFolderId?: string;
      destinationFolderName?: string;
      alwaysUrgent?: boolean;
      notifyTeamLeader?: boolean;
      autoAcknowledge?: boolean;
      acknowledgeTemplate?: string;
      tatMinutes?: number;
      useRoundRobin?: boolean;
      fixedAssigneeEmail?: string;
      active?: boolean;
    };

    // Upsert by categoryId
    const rule = await prisma.routingRule.upsert({
      where: { categoryId: body.categoryId },
      create: {
        mailboxId: body.mailboxId,
        categoryId: body.categoryId,
        categoryName: body.categoryName,
        destinationFolderId: body.destinationFolderId ?? null,
        destinationFolderName: body.destinationFolderName ?? null,
        alwaysUrgent: body.alwaysUrgent ?? false,
        notifyTeamLeader: body.notifyTeamLeader ?? false,
        autoAcknowledge: body.autoAcknowledge ?? false,
        acknowledgeTemplate: body.acknowledgeTemplate ?? null,
        tatMinutes: body.tatMinutes ?? 1440,
        useRoundRobin: body.useRoundRobin ?? true,
        fixedAssigneeEmail: body.fixedAssigneeEmail ?? null,
        active: body.active ?? true,
      },
      update: {
        categoryName: body.categoryName,
        destinationFolderId: body.destinationFolderId ?? null,
        destinationFolderName: body.destinationFolderName ?? null,
        alwaysUrgent: body.alwaysUrgent ?? false,
        notifyTeamLeader: body.notifyTeamLeader ?? false,
        autoAcknowledge: body.autoAcknowledge ?? false,
        acknowledgeTemplate: body.acknowledgeTemplate ?? null,
        tatMinutes: body.tatMinutes ?? 1440,
        useRoundRobin: body.useRoundRobin ?? true,
        fixedAssigneeEmail: body.fixedAssigneeEmail ?? null,
        active: body.active ?? true,
      },
    });

    return Response.json(rule);
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

    await prisma.routingRule.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
