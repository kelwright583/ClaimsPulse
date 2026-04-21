import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { Prisma } from '@prisma/client';
import { getFyBoundaries } from '@/lib/fiscal';

const ALLOWED_ROLES = ['SENIOR_MANAGEMENT', 'HEAD_OF_CLAIMS'] as const;

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const cause = searchParams.get('cause');
    const handler = searchParams.get('handler');
    const dateRange = searchParams.get('dateRange');

    // Latest snapshot date
    const latestSnap = await prisma.$queryRaw<{ max_date: Date | null }[]>`
      SELECT MAX(snapshot_date) AS max_date FROM claim_snapshots
    `;
    const snapshotDate = latestSnap[0]?.max_date ?? new Date();

    const where: Prisma.ClaimSnapshotWhereInput = {
      snapshotDate,
      totalIncurred: { gt: 250000 },
    };

    if (cause) where.cause = { contains: cause, mode: 'insensitive' };
    if (handler) where.handler = { contains: handler, mode: 'insensitive' };

    // Handle dateRange for date of loss
    if (dateRange) {
      const now = new Date();
      if (dateRange === 'this-month') {
        where.dateOfLoss = { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
      } else if (dateRange === 'last-month') {
        where.dateOfLoss = {
          gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          lte: new Date(now.getFullYear(), now.getMonth(), 0),
        };
      } else if (dateRange === 'last-3-months') {
        where.dateOfLoss = { gte: new Date(now.getFullYear(), now.getMonth() - 3, 1) };
      } else if (dateRange === 'ytd') {
        const { fyStart } = getFyBoundaries(now);
        where.dateOfLoss = { gte: fyStart };
      }
    }

    const [claimsOver250k, theftHijackOpen, exposureAgg, claimsRaw] = await Promise.all([
      prisma.claimSnapshot.count({ where }),
      prisma.claimSnapshot.count({
        where: {
          ...where,
          cause: { in: ['Vehicle theft', 'Vehicle hijack'] },
          claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] },
        },
      }),
      prisma.claimSnapshot.aggregate({ where, _sum: { totalIncurred: true } }),
      prisma.claimSnapshot.findMany({
        where,
        orderBy: { totalIncurred: 'desc' },
        take: 100,
        select: {
          claimId: true,
          insured: true,
          handler: true,
          cause: true,
          claimStatus: true,
          secondaryStatus: true,
          dateOfLoss: true,
          totalIncurred: true,
          totalOs: true,
          totalPaid: true,
          daysInCurrentStatus: true,
          isTatBreach: true,
          lossArea: true,
        },
      }),
    ]);

    const claims = claimsRaw.map(r => ({
      claimId: r.claimId,
      insured: r.insured,
      handler: r.handler,
      cause: r.cause,
      claimStatus: r.claimStatus,
      secondaryStatus: r.secondaryStatus,
      dateOfLoss: r.dateOfLoss ? r.dateOfLoss.toISOString().split('T')[0] : null,
      totalIncurred: r.totalIncurred ? Number(r.totalIncurred) : null,
      totalOs: r.totalOs ? Number(r.totalOs) : null,
      totalPaid: r.totalPaid ? Number(r.totalPaid) : null,
      daysOpen: r.daysInCurrentStatus,
      isTatBreach: r.isTatBreach,
      lossArea: r.lossArea,
    }));

    // Monthly trend
    const now = new Date(snapshotDate);
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const monthlyTrendRaw = await prisma.$queryRaw<{ month: string; count: bigint; total: string }[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', snapshot_date), 'YYYY-MM') AS month,
        COUNT(*) AS count,
        SUM(total_incurred)::text AS total
      FROM claim_snapshots
      WHERE snapshot_date >= ${twelveMonthsAgo}
        AND total_incurred > 250000
        ${cause ? Prisma.sql`AND cause ILIKE ${`%${cause}%`}` : Prisma.empty}
        ${handler ? Prisma.sql`AND handler ILIKE ${`%${handler}%`}` : Prisma.empty}
      GROUP BY DATE_TRUNC('month', snapshot_date)
      ORDER BY DATE_TRUNC('month', snapshot_date)
    `;

    const monthlyTrend = monthlyTrendRaw.map(r => ({
      month: r.month,
      count: Number(r.count),
      totalIncurred: parseFloat(r.total ?? '0'),
    }));

    return NextResponse.json({
      summary: {
        claimsOver250k,
        theftHijackOpen,
        totalExposure: exposureAgg._sum.totalIncurred ? Number(exposureAgg._sum.totalIncurred) : 0,
      },
      claims,
      monthlyTrend,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
