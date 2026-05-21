import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { priorityFromTat } from '@/lib/reports/tat-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  let handler = searchParams.get('handler');
  const compareFrom = searchParams.get('compareFrom');
  const compareTo = searchParams.get('compareTo');

  if (ctx.role === 'CLAIMS_TECHNICIAN') {
    handler = ctx.fullName ?? handler;
  }

  if (!compareFrom || !compareTo) {
    return NextResponse.json({ error: 'compareFrom and compareTo required' }, { status: 400 });
  }

  try {
    const tatConfigs = await prisma.tatConfig.findMany({ where: { isActive: true } });
    const tatMap = new Map(tatConfigs.map(c => [c.secondaryStatus, c]));

    const where = (date: Date) => ({
      snapshotDate: date,
      claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] },
      ...(handler && handler !== '__all__' ? { handler } : {}),
    });

    const [fromSnaps, toSnaps] = await Promise.all([
      prisma.claimSnapshot.findMany({
        where: where(new Date(compareFrom)),
        select: { claimId: true, secondaryStatus: true, daysInCurrentStatus: true },
      }),
      prisma.claimSnapshot.findMany({
        where: where(new Date(compareTo)),
        select: { claimId: true, secondaryStatus: true, daysInCurrentStatus: true },
      }),
    ]);

    const count = (snaps: typeof fromSnaps, p: 'critical' | 'urgent' | 'standard') =>
      snaps.filter(s => priorityFromTat(s.secondaryStatus, s.daysInCurrentStatus, false, tatMap) === p).length;

    return NextResponse.json({
      from: {
        critical: count(fromSnaps, 'critical'),
        urgent: count(fromSnaps, 'urgent'),
        standard: count(fromSnaps, 'standard'),
        date: compareFrom,
      },
      to: {
        critical: count(toSnaps, 'critical'),
        urgent: count(toSnaps, 'urgent'),
        standard: count(toSnaps, 'standard'),
        date: compareTo,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
