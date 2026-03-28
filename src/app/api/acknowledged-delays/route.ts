import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const claimId = searchParams.get('claimId');
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    const where: { claimId?: string; isActive?: boolean } = {};
    if (claimId) where.claimId = decodeURIComponent(claimId);
    if (activeOnly) where.isActive = true;

    const delays = await prisma.acknowledgedDelay.findMany({
      where,
      orderBy: { loggedAt: 'desc' },
    });

    const data = delays.map(d => ({
      ...d,
      expectedDate: d.expectedDate.toISOString(),
      loggedAt: d.loggedAt.toISOString(),
      resolvedAt: d.resolvedAt?.toISOString() ?? null,
    }));

    return Response.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json() as {
      claimId: string;
      secondaryStatus: string;
      reasonType: string;
      note?: string;
      expectedDate: string;
    };

    const { claimId, secondaryStatus, reasonType, note, expectedDate } = body;

    if (!claimId || !secondaryStatus || !reasonType || !expectedDate) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const delay = await prisma.acknowledgedDelay.create({
      data: {
        claimId,
        secondaryStatus,
        reasonType,
        note: note ?? null,
        expectedDate: new Date(expectedDate),
        loggedBy: ctx.userId,
        isActive: true,
        isOverdue: false,
      },
    });

    return Response.json({
      ...delay,
      expectedDate: delay.expectedDate.toISOString(),
      loggedAt: delay.loggedAt.toISOString(),
      resolvedAt: delay.resolvedAt?.toISOString() ?? null,
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
