import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const handler = searchParams.get('handler');

  const targets = await db.handlerTarget.findMany({
    where: handler ? { handler } : undefined,
    orderBy: [{ handler: 'asc' }, { metricType: 'asc' }],
  });

  const configs = await db.targetMetricConfig.findMany({
    where: { isActive: true },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configMap = new Map<string, any>(configs.map((c: any) => [c.metricType, c]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = targets.map((t: any) => {
    const cfg = configMap.get(t.metricType);
    return {
      id: t.id,
      handler: t.handler,
      metricType: t.metricType,
      targetValue: Number(t.targetValue),
      cadence: cfg?.cadence ?? '',
      unit: cfg?.unit ?? '',
      label: cfg?.label ?? t.metricType,
      updatedAt: t.updatedAt,
    };
  });

  return NextResponse.json(result);
}

export async function PUT(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['HEAD_OF_CLAIMS', 'TEAM_LEADER'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { handler, metricType, targetValue } = await req.json();
  if (!handler || !metricType || targetValue === undefined) {
    return NextResponse.json({ error: 'handler, metricType and targetValue are required' }, { status: 400 });
  }

  const result = await db.handlerTarget.upsert({
    where: { handler_metricType: { handler, metricType } },
    update: { targetValue, setBy: ctx.userId },
    create: { handler, metricType, targetValue, setBy: ctx.userId },
  });

  return NextResponse.json(result);
}

export async function DELETE(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['HEAD_OF_CLAIMS', 'TEAM_LEADER'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { handler, metricType } = await req.json();
  if (!handler || !metricType) {
    return NextResponse.json({ error: 'handler and metricType are required' }, { status: 400 });
  }

  await db.handlerTarget.delete({
    where: { handler_metricType: { handler, metricType } },
  });

  return NextResponse.json({ ok: true });
}
