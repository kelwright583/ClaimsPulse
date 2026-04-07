import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAuth();

    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [gwpByMonthRaw, endorsementSplitRaw, topProductLinesRaw] = await Promise.all([
      // GWP by month (last 6 months)
      prisma.$queryRaw<Array<{ month: string; gwp: unknown; net_wp: unknown }>>`
        SELECT TO_CHAR(period_date, 'YYYY-MM') as month,
               SUM(gwp) as gwp,
               SUM(net_wp) as net_wp
        FROM premium_records
        WHERE period_date >= ${sixMonthsAgo}
        GROUP BY TO_CHAR(period_date, 'YYYY-MM')
        ORDER BY month ASC
      `,

      // Endorsement split
      prisma.$queryRaw<Array<{ endorsement_type: string | null; gwp: unknown }>>`
        SELECT endorsement_type,
               SUM(gwp) as gwp
        FROM premium_records
        WHERE period_date >= ${sixMonthsAgo}
        GROUP BY endorsement_type
        ORDER BY gwp DESC
      `,

      // Top 5 product lines by GWP
      prisma.$queryRaw<Array<{ product_line: string | null; gwp: unknown }>>`
        SELECT class_name as product_line,
               SUM(gwp) as gwp
        FROM premium_records
        WHERE period_date >= ${sixMonthsAgo}
        GROUP BY class_name
        ORDER BY gwp DESC
        LIMIT 5
      `,
    ]);

    const gwpByMonth = gwpByMonthRaw.map(r => ({
      month: r.month,
      gwp: Number(r.gwp ?? 0),
      netWp: Number(r.net_wp ?? 0),
    }));

    const endorsementSplit = endorsementSplitRaw.map(r => ({
      endorsementType: r.endorsement_type ?? 'Unknown',
      gwp: Number(r.gwp ?? 0),
    }));

    const topProductLines = topProductLinesRaw.map(r => ({
      productLine: r.product_line ?? 'Unknown',
      gwp: Number(r.gwp ?? 0),
    }));

    return Response.json({ gwpByMonth, endorsementSplit, topProductLines });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
