import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Find latest snapshot date
  const latest = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });

  if (!latest) return NextResponse.json([]);

  const snapshotDate = latest.snapshotDate;

  // Get distinct handlers at that date with open claim counts
  const snapshots = await prisma.claimSnapshot.findMany({
    where: {
      snapshotDate,
      NOT: { claimStatus: { contains: 'Finalised' } },
    },
    select: { handler: true },
  });

  const handlerMap = new Map<string, number>();
  for (const s of snapshots) {
    const h = s.handler ?? 'Unknown';
    handlerMap.set(h, (handlerMap.get(h) ?? 0) + 1);
  }

  const result = Array.from(handlerMap.entries()).map(([handler, openClaims]) => ({
    handler,
    openClaims,
  }));

  return NextResponse.json(result);
}
