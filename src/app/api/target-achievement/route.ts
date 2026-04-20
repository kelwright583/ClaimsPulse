import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { computeTargetAchievement } from '@/lib/compute/target-achievement';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const handler = searchParams.get('handler') ?? undefined;

  const data = await computeTargetAchievement(handler);
  return NextResponse.json(data);
}
