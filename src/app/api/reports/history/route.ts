import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const reports = await db.generatedReport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(reports);
}
