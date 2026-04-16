import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const latestDate = await prisma.claimSnapshot.findFirst({
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    });

    if (!latestDate) {
      return NextResponse.json({ handlers: [], causes: [], areas: [] });
    }

    const [handlers, causes, areas] = await Promise.all([
      prisma.claimSnapshot.findMany({
        where: { snapshotDate: latestDate.snapshotDate, handler: { not: null } },
        select: { handler: true },
        distinct: ['handler'],
        orderBy: { handler: 'asc' },
      }),
      prisma.claimSnapshot.findMany({
        where: { snapshotDate: latestDate.snapshotDate, cause: { not: null } },
        select: { cause: true },
        distinct: ['cause'],
        orderBy: { cause: 'asc' },
      }),
      prisma.claimSnapshot.findMany({
        where: { snapshotDate: latestDate.snapshotDate, lossArea: { not: null } },
        select: { lossArea: true },
        distinct: ['lossArea'],
        orderBy: { lossArea: 'asc' },
      }),
    ]);

    return NextResponse.json({
      handlers: handlers.map(r => r.handler!).filter(Boolean),
      causes: causes.map(r => r.cause!).filter(Boolean),
      areas: areas.map(r => r.lossArea!).filter(Boolean),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
