import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const rows = await prisma.$queryRaw<{ snapshot_date: Date }[]>`
      SELECT DISTINCT snapshot_date
      FROM claim_snapshots
      ORDER BY snapshot_date DESC
    `;

    const dates = rows.map(r => r.snapshot_date.toISOString().split('T')[0]);

    const monthSet = new Set<string>();
    const yearSet = new Set<number>();
    for (const d of dates) {
      monthSet.add(d.substring(0, 7)); // 'YYYY-MM'
      yearSet.add(parseInt(d.substring(0, 4), 10));
    }

    return NextResponse.json({
      dates,
      months: Array.from(monthSet).sort((a, b) => b.localeCompare(a)),
      years: Array.from(yearSet).sort((a, b) => b - a),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
