import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const targets = await prisma.target.findMany({
      orderBy: [{ metricType: 'asc' }, { productLine: 'asc' }],
    });

    return NextResponse.json(
      targets.map((t) => ({
        id: t.id,
        metricType: t.metricType,
        productLine: t.productLine,
        uwYear: t.uwYear,
        annualTarget: t.annualTarget.toNumber(),
        setBy: t.setBy,
        updatedAt: t.updatedAt.toISOString(),
      }))
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['HEAD_OF_CLAIMS', 'SENIOR_MANAGEMENT'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json() as {
      metricType: string;
      productLine: string | null | undefined;
      uwYear: number;
      annualTarget: number;
    };

    const { metricType, productLine, uwYear, annualTarget } = body;

    const target = await prisma.target.upsert({
      where: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metricType_productLine_uwYear: { metricType, productLine: (productLine ?? null) as any, uwYear: Number(uwYear) },
      },
      update: {
        annualTarget,
        setBy: ctx.userId,
      },
      create: {
        metricType,
        productLine: productLine ?? null,
        uwYear: Number(uwYear),
        annualTarget,
        setBy: ctx.userId,
      },
    });

    return NextResponse.json({ id: target.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
