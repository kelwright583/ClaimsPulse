import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const claimId = searchParams.get('claimId');

    if (!claimId) {
      return NextResponse.json({ error: 'claimId query param is required' }, { status: 400 });
    }

    const actions = await prisma.claimAction.findMany({
      where: { claimId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(
      actions.map((a) => ({
        id: a.id,
        claimId: a.claimId,
        actionType: a.actionType,
        isComplete: a.isComplete,
        completedAt: a.completedAt ? a.completedAt.toISOString() : null,
        completedBy: a.completedBy,
        note: a.note,
        metadata: a.metadata,
        createdAt: a.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as {
      claimId: string;
      actionType: string;
      isComplete: boolean;
      note?: string;
      metadata?: Record<string, unknown>;
    };

    const { claimId, actionType, isComplete, note, metadata } = body;

    if (!claimId || !actionType) {
      return NextResponse.json({ error: 'claimId and actionType are required' }, { status: 400 });
    }

    const createData: Parameters<typeof prisma.claimAction.create>[0]['data'] = {
      claimId,
      actionType,
      isComplete: Boolean(isComplete),
      completedAt: isComplete ? new Date() : null,
      completedBy: isComplete ? ctx.userId : null,
      note: note ?? null,
    };
    if (metadata != null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (createData as any).metadata = metadata;
    }
    const action = await prisma.claimAction.create({ data: createData });

    return NextResponse.json({ id: action.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
