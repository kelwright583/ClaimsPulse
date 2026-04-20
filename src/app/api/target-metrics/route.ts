import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const configs = await db.targetMetricConfig.findMany({
    where: { isActive: true },
    orderBy: { metricType: 'asc' },
  });

  return NextResponse.json(configs);
}

export async function PATCH(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (ctx.role !== 'HEAD_OF_CLAIMS') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { metricType, cadence } = await req.json();
  if (!metricType || !cadence) {
    return NextResponse.json({ error: 'metricType and cadence are required' }, { status: 400 });
  }

  const result = await db.targetMetricConfig.update({
    where: { metricType },
    data: { cadence },
  });

  return NextResponse.json(result);
}
