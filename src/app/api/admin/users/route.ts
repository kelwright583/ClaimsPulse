import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (ctx.role !== 'HEAD_OF_CLAIMS') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const users = await prisma.profile.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return Response.json({ users });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (ctx.role !== 'HEAD_OF_CLAIMS') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { userId, role } = body;
    if (!userId || !role) return Response.json({ error: 'Missing userId or role' }, { status: 400 });

    const VALID_ROLES = ['SENIOR_MANAGEMENT', 'HEAD_OF_CLAIMS', 'TEAM_LEADER', 'CLAIMS_TECHNICIAN', 'TP_HANDLER', 'SALVAGE_HANDLER'];
    if (!VALID_ROLES.includes(role)) return Response.json({ error: 'Invalid role' }, { status: 400 });

    const updated = await prisma.profile.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, fullName: true, role: true },
    });

    return Response.json({ user: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
