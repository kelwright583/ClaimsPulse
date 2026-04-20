import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import type { Prisma } from '@prisma/client';

const ALLOWED_ROLES = ['HEAD_OF_CLAIMS', 'TEAM_LEADER'] as const;

async function getLatestSnapshotDate(): Promise<Date | null> {
  const result = await prisma.claimSnapshot.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  return result?.snapshotDate ?? null;
}

function n(v: unknown): number | null {
  if (v == null) return null;
  const num = Number(v);
  return isNaN(num) ? null : num;
}

function buildBaseWhere(
  type: string,
  snapshotDate: Date,
  params: URLSearchParams
): Prisma.ClaimSnapshotWhereInput {
  const handler = params.get('handler');
  const status = params.get('status');
  const cause = params.get('cause');
  const area = params.get('area');
  const from = params.get('from');
  const to = params.get('to');

  const base: Prisma.ClaimSnapshotWhereInput = { snapshotDate };

  switch (type) {
    case 'sla_breaches':
      base.isTatBreach = true;
      base.claimStatus = { notIn: ['Finalised', 'Cancelled', 'Repudiated'] };
      break;
    case 'big_claims':
      base.claimStatus = { notIn: ['Finalised', 'Cancelled', 'Repudiated'] };
      base.totalIncurred = { gt: 250000 };
      break;
    case 'unassigned_payment':
      base.handler = null;
      base.totalPaid = { gt: 0 };
      break;
    case 'ready_to_close':
      base.claimStatus = { notIn: ['Finalised', 'Cancelled', 'Repudiated'] };
      base.OR = [{ totalOs: null }, { totalOs: 0 }];
      break;
    case 'value_jumps':
      base.deltaFlags = { path: ['value_jump_20pct'], equals: true };
      break;
    case 'reserve_by_handler':
      base.claimStatus = { notIn: ['Finalised', 'Cancelled', 'Repudiated'] };
      base.intimatedAmount = { gt: 0 };
      break;
    case 'handler':
      base.claimStatus = { notIn: ['Finalised', 'Cancelled', 'Repudiated'] };
      break;
    default:
      break;
  }

  // User filters (additive)
  if (handler) base.handler = handler;
  if (status) base.claimStatus = status;
  if (cause) base.cause = { contains: cause, mode: 'insensitive' };
  if (area) base.lossArea = { contains: area, mode: 'insensitive' };
  if (from || to) {
    base.snapshotDate = {};
    if (from) (base.snapshotDate as Prisma.DateTimeFilter).gte = new Date(from);
    if (to) (base.snapshotDate as Prisma.DateTimeFilter).lte = new Date(to);
  }

  return base;
}

function getSortField(sort: string): string {
  const allowed = [
    'claimId', 'handler', 'claimStatus', 'secondaryStatus', 'daysInCurrentStatus',
    'daysOpen', 'totalPaid', 'totalOs', 'totalIncurred', 'intimatedAmount',
    'dateOfLoss', 'flaggedAt', 'grossPaid',
  ];
  return allowed.includes(sort) ? sort : 'totalIncurred';
}

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') ?? 'sla_breaches';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));
    const sort = getSortField(searchParams.get('sort') ?? '');
    const dir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
    const skip = (page - 1) * limit;

    const latestDate = await getLatestSnapshotDate();
    if (!latestDate) {
      return NextResponse.json({
        summary: { totalClaims: 0, totalIncurred: 0, totalOutstanding: 0, totalPaid: 0, avgDaysInStatus: 0 },
        claims: [],
        pagination: { page: 1, limit, total: 0, totalPages: 0 },
      });
    }

    if (type === 'newly_breached') {
      // Get previous snapshot date
      const prevSnap = await prisma.claimSnapshot.findFirst({
        where: { snapshotDate: { lt: latestDate } },
        orderBy: { snapshotDate: 'desc' },
        select: { snapshotDate: true },
      });
      const prevDate = prevSnap?.snapshotDate ?? null;

      const [breachedToday, breachedYesterday] = await Promise.all([
        prisma.claimSnapshot.findMany({
          where: { snapshotDate: latestDate, isTatBreach: true },
          select: { claimId: true },
        }),
        prevDate
          ? prisma.claimSnapshot.findMany({
              where: { snapshotDate: prevDate, isTatBreach: true },
              select: { claimId: true },
            })
          : Promise.resolve([]),
      ]);

      const prevBreachSet = new Set(breachedYesterday.map(r => r.claimId));
      const newlyBreachedIds = breachedToday
        .filter(r => !prevBreachSet.has(r.claimId))
        .map(r => r.claimId);

      const baseWhere: Prisma.ClaimSnapshotWhereInput = {
        snapshotDate: latestDate,
        claimId: { in: newlyBreachedIds },
        isTatBreach: true,
      };
      const handler = searchParams.get('handler');
      const status = searchParams.get('status');
      if (handler) baseWhere.handler = handler;
      if (status) baseWhere.claimStatus = status;

      const tatConfigs = await prisma.tatConfig.findMany({
        where: { isActive: true },
        select: { secondaryStatus: true, maxDays: true },
      });
      const tatConfigMap = new Map(tatConfigs.map(c => [c.secondaryStatus, c.maxDays]));

      const orderBy: Prisma.ClaimSnapshotOrderByWithRelationInput =
        sort === 'daysInCurrentStatus' ? { daysInCurrentStatus: dir }
        : sort === 'totalOs' ? { totalOs: dir }
        : { daysInCurrentStatus: 'desc' };

      const [total, rows, agg] = await Promise.all([
        prisma.claimSnapshot.count({ where: baseWhere }),
        prisma.claimSnapshot.findMany({
          where: baseWhere, skip, take: limit, orderBy,
          select: {
            claimId: true, handler: true, claimStatus: true, secondaryStatus: true,
            cause: true, lossArea: true, insured: true, broker: true,
            dateOfLoss: true, daysInCurrentStatus: true, daysOpen: true,
            intimatedAmount: true, totalPaid: true, totalOs: true, totalIncurred: true,
            totalRecovery: true, totalSalvage: true, isTatBreach: true,
          },
        }),
        prisma.claimSnapshot.aggregate({
          where: baseWhere,
          _sum: { totalIncurred: true, totalOs: true, totalPaid: true },
          _avg: { daysInCurrentStatus: true },
          _max: { daysInCurrentStatus: true },
        }),
      ]);

      const byStatusRaw = await prisma.claimSnapshot.groupBy({
        by: ['secondaryStatus'],
        where: baseWhere,
        _count: { claimId: true },
        orderBy: { _count: { claimId: 'desc' } },
        take: 8,
      });

      const claims = rows.map(r => ({
        claimId: r.claimId,
        handler: r.handler ?? null,
        claimStatus: r.claimStatus ?? null,
        secondaryStatus: r.secondaryStatus ?? null,
        cause: r.cause ?? null,
        lossArea: r.lossArea ?? null,
        insured: r.insured ?? null,
        broker: r.broker ?? null,
        dateOfLoss: r.dateOfLoss?.toISOString() ?? null,
        daysInCurrentStatus: r.daysInCurrentStatus ?? null,
        daysOpen: r.daysOpen ?? null,
        intimatedAmount: r.intimatedAmount ? n(r.intimatedAmount) : null,
        totalPaid: r.totalPaid ? n(r.totalPaid) : null,
        totalOutstanding: r.totalOs ? n(r.totalOs) : null,
        totalIncurred: r.totalIncurred ? n(r.totalIncurred) : null,
        totalRecovery: r.totalRecovery ? n(r.totalRecovery) : null,
        totalSalvage: r.totalSalvage ? n(r.totalSalvage) : null,
        isTatBreach: r.isTatBreach,
        daysOverSla: (r.secondaryStatus && r.daysInCurrentStatus != null)
          ? Math.max(0, r.daysInCurrentStatus - (tatConfigMap.get(r.secondaryStatus) ?? 0))
          : null,
      }));

      return NextResponse.json({
        summary: {
          totalClaims: total,
          totalIncurred: agg._sum.totalIncurred ? n(agg._sum.totalIncurred) ?? 0 : 0,
          totalOutstanding: agg._sum.totalOs ? n(agg._sum.totalOs) ?? 0 : 0,
          totalPaid: agg._sum.totalPaid ? n(agg._sum.totalPaid) ?? 0 : 0,
          avgDaysInStatus: agg._avg.daysInCurrentStatus ? Math.round(Number(agg._avg.daysInCurrentStatus) * 10) / 10 : 0,
          worstBreachDays: agg._max.daysInCurrentStatus ?? 0,
          byStatus: byStatusRaw.map(r => ({ status: r.secondaryStatus ?? 'Unknown', count: r._count.claimId })),
        },
        claims,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }

    if (type === 'stagnant') {
      // Claims breached AND no secondary status change since previous snapshot
      const breachedSnapshots = await prisma.claimSnapshot.findMany({
        where: { snapshotDate: latestDate, isTatBreach: true },
        select: { claimId: true, deltaFlags: true },
      });

      const stagnantIds = breachedSnapshots
        .filter(s => {
          const flags = s.deltaFlags as Record<string, unknown> | null;
          return !flags?.['secondary_status_change'];
        })
        .map(s => s.claimId);

      const baseWhere: Prisma.ClaimSnapshotWhereInput = {
        snapshotDate: latestDate,
        claimId: { in: stagnantIds },
        isTatBreach: true,
      };
      const handler = searchParams.get('handler');
      const status = searchParams.get('status');
      if (handler) baseWhere.handler = handler;
      if (status) baseWhere.claimStatus = status;

      const orderBy: Prisma.ClaimSnapshotOrderByWithRelationInput =
        sort === 'totalOs' ? { totalOs: dir }
        : sort === 'handler' ? { handler: dir }
        : { daysInCurrentStatus: 'desc' };

      const [total, rows, agg] = await Promise.all([
        prisma.claimSnapshot.count({ where: baseWhere }),
        prisma.claimSnapshot.findMany({
          where: baseWhere, skip, take: limit, orderBy,
          select: {
            claimId: true, handler: true, claimStatus: true, secondaryStatus: true,
            cause: true, lossArea: true, insured: true, broker: true,
            dateOfLoss: true, daysInCurrentStatus: true, daysOpen: true,
            intimatedAmount: true, totalPaid: true, totalOs: true, totalIncurred: true,
            totalRecovery: true, totalSalvage: true, isTatBreach: true,
          },
        }),
        prisma.claimSnapshot.aggregate({
          where: baseWhere,
          _sum: { totalIncurred: true, totalOs: true, totalPaid: true },
          _avg: { daysInCurrentStatus: true },
        }),
      ]);

      const byHandlerRaw = await prisma.claimSnapshot.groupBy({
        by: ['handler'],
        where: baseWhere,
        _count: { claimId: true },
        orderBy: { _count: { claimId: 'desc' } },
        take: 8,
      });

      const claims = rows.map(r => ({
        claimId: r.claimId,
        handler: r.handler ?? null,
        claimStatus: r.claimStatus ?? null,
        secondaryStatus: r.secondaryStatus ?? null,
        cause: r.cause ?? null,
        lossArea: r.lossArea ?? null,
        insured: r.insured ?? null,
        broker: r.broker ?? null,
        dateOfLoss: r.dateOfLoss?.toISOString() ?? null,
        daysInCurrentStatus: r.daysInCurrentStatus ?? null,
        daysOpen: r.daysOpen ?? null,
        intimatedAmount: r.intimatedAmount ? n(r.intimatedAmount) : null,
        totalPaid: r.totalPaid ? n(r.totalPaid) : null,
        totalOutstanding: r.totalOs ? n(r.totalOs) : null,
        totalIncurred: r.totalIncurred ? n(r.totalIncurred) : null,
        totalRecovery: r.totalRecovery ? n(r.totalRecovery) : null,
        totalSalvage: r.totalSalvage ? n(r.totalSalvage) : null,
        isTatBreach: r.isTatBreach,
      }));

      return NextResponse.json({
        summary: {
          totalClaims: total,
          totalIncurred: agg._sum.totalIncurred ? n(agg._sum.totalIncurred) ?? 0 : 0,
          totalOutstanding: agg._sum.totalOs ? n(agg._sum.totalOs) ?? 0 : 0,
          totalPaid: agg._sum.totalPaid ? n(agg._sum.totalPaid) ?? 0 : 0,
          avgDaysInStatus: agg._avg.daysInCurrentStatus ? Math.round(Number(agg._avg.daysInCurrentStatus) * 10) / 10 : 0,
          byHandler: byHandlerRaw.map(r => ({ handler: r.handler ?? 'Unassigned', count: r._count.claimId })),
        },
        claims,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }

    if (type === 'red_flags') {
      const flagWhere: Prisma.ClaimFlagWhereInput = {
        detail: { path: ['actioned'], equals: false },
      };
      const handler = searchParams.get('handler');

      const [total, flags] = await Promise.all([
        prisma.claimFlag.count({ where: flagWhere }),
        prisma.claimFlag.findMany({
          where: flagWhere,
          skip,
          take: limit,
          orderBy: { createdAt: dir === 'asc' ? 'asc' : 'desc' },
          select: {
            claimId: true,
            flagType: true,
            severity: true,
            detail: true,
            createdAt: true,
          },
        }),
      ]);

      // Get snapshot data for these claims
      const claimIds = flags.map(f => f.claimId);
      const snapshots = claimIds.length > 0
        ? await prisma.claimSnapshot.findMany({
            where: { snapshotDate: latestDate, claimId: { in: claimIds }, ...(handler ? { handler } : {}) },
            select: {
              claimId: true, handler: true, claimStatus: true, totalIncurred: true,
              totalOs: true, totalPaid: true,
            },
          })
        : [];
      const snapMap = new Map(snapshots.map(s => [s.claimId, s]));

      // Summary by flag type
      const byFlagType = await prisma.claimFlag.groupBy({
        by: ['flagType'],
        where: flagWhere,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      });

      const claims = flags.map(f => {
        const snap = snapMap.get(f.claimId);
        const detail = f.detail as Record<string, unknown> | null;
        return {
          claimId: f.claimId,
          handler: snap?.handler ?? null,
          claimStatus: snap?.claimStatus ?? null,
          secondaryStatus: null,
          cause: null,
          lossArea: null,
          insured: null,
          broker: null,
          dateOfLoss: null,
          daysInCurrentStatus: null,
          daysOpen: null,
          intimatedAmount: null,
          totalPaid: snap?.totalPaid ? n(snap.totalPaid) : null,
          totalOutstanding: snap?.totalOs ? n(snap.totalOs) : null,
          totalIncurred: snap?.totalIncurred ? n(snap.totalIncurred) : null,
          totalRecovery: null,
          totalSalvage: null,
          isTatBreach: false,
          flagType: f.flagType as string,
          flagDetail: detail ? (detail['message'] as string ?? detail['detail'] as string ?? JSON.stringify(detail)) : null,
          flaggedAt: f.createdAt.toISOString(),
        };
      });

      return NextResponse.json({
        summary: {
          totalClaims: total,
          totalIncurred: 0,
          totalOutstanding: 0,
          totalPaid: 0,
          avgDaysInStatus: 0,
          byStatus: byFlagType.map(r => ({ status: r.flagType as string, count: r._count.id })),
        },
        claims,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }

    // Standard snapshot-based query
    const baseWhere = buildBaseWhere(type, latestDate, searchParams);

    const orderBy: Prisma.ClaimSnapshotOrderByWithRelationInput = {};
    switch (sort) {
      case 'daysInCurrentStatus': orderBy.daysInCurrentStatus = dir; break;
      case 'daysOpen': orderBy.daysOpen = dir; break;
      case 'totalPaid': orderBy.totalPaid = dir; break;
      case 'totalOs': orderBy.totalOs = dir; break;
      case 'totalIncurred': orderBy.totalIncurred = dir; break;
      case 'intimatedAmount': orderBy.intimatedAmount = dir; break;
      case 'dateOfLoss': orderBy.dateOfLoss = dir; break;
      case 'handler': orderBy.handler = dir; break;
      case 'claimId': orderBy.claimId = dir; break;
      default: orderBy.totalIncurred = dir; break;
    }

    const [total, rows, agg] = await Promise.all([
      prisma.claimSnapshot.count({ where: baseWhere }),
      prisma.claimSnapshot.findMany({
        where: baseWhere,
        skip,
        take: limit,
        orderBy,
        select: {
          claimId: true, handler: true, claimStatus: true, secondaryStatus: true,
          cause: true, lossArea: true, insured: true, broker: true,
          dateOfLoss: true, daysInCurrentStatus: true, daysOpen: true,
          intimatedAmount: true, totalPaid: true, totalOs: true, totalIncurred: true,
          totalRecovery: true, totalSalvage: true, isTatBreach: true, deltaFlags: true,
        },
      }),
      prisma.claimSnapshot.aggregate({
        where: baseWhere,
        _sum: { totalIncurred: true, totalOs: true, totalPaid: true },
        _avg: { daysInCurrentStatus: true },
        _count: { claimId: true },
        _max: { daysInCurrentStatus: true },
      }),
    ]);

    // Summary breakdowns
    const [byHandlerRaw, byStatusRaw, byCauseRaw, byAreaRaw] = await Promise.all([
      prisma.claimSnapshot.groupBy({
        by: ['handler'],
        where: baseWhere,
        _count: { claimId: true },
        orderBy: { _count: { claimId: 'desc' } },
        take: 8,
      }),
      prisma.claimSnapshot.groupBy({
        by: ['secondaryStatus'],
        where: baseWhere,
        _count: { claimId: true },
        orderBy: { _count: { claimId: 'desc' } },
        take: 8,
      }),
      prisma.claimSnapshot.groupBy({
        by: ['cause'],
        where: baseWhere,
        _count: { claimId: true },
        orderBy: { _count: { claimId: 'desc' } },
        take: 8,
      }),
      prisma.claimSnapshot.groupBy({
        by: ['lossArea'],
        where: baseWhere,
        _count: { claimId: true },
        orderBy: { _count: { claimId: 'desc' } },
        take: 8,
      }),
    ]);

    const claimIds = rows.map(r => r.claimId);
    const delayMap = new Map<string, { hasDelay: boolean; expectedDate: string | null }>();

    // SLA config for breach day computation
    let tatConfigMap = new Map<string, number>();
    if (type === 'sla_breaches') {
      const configs = await prisma.tatConfig.findMany({ where: { isActive: true }, select: { secondaryStatus: true, maxDays: true } });
      for (const c of configs) tatConfigMap.set(c.secondaryStatus, c.maxDays);
    }

    const claims = rows.map(r => {
      const flags = r.deltaFlags as Record<string, unknown> | null;
      const daysOverSla = (type === 'sla_breaches' && r.secondaryStatus && r.daysInCurrentStatus != null)
        ? Math.max(0, r.daysInCurrentStatus - (tatConfigMap.get(r.secondaryStatus) ?? 0))
        : null;

      const delay = delayMap.get(r.claimId);

      return {
        claimId: r.claimId,
        handler: r.handler ?? null,
        claimStatus: r.claimStatus ?? null,
        secondaryStatus: r.secondaryStatus ?? null,
        cause: r.cause ?? null,
        lossArea: r.lossArea ?? null,
        insured: r.insured ?? null,
        broker: r.broker ?? null,
        dateOfLoss: r.dateOfLoss?.toISOString() ?? null,
        daysInCurrentStatus: r.daysInCurrentStatus ?? null,
        daysOpen: r.daysOpen ?? null,
        intimatedAmount: r.intimatedAmount ? n(r.intimatedAmount) : null,
        totalPaid: r.totalPaid ? n(r.totalPaid) : null,
        totalOutstanding: r.totalOs ? n(r.totalOs) : null,
        totalIncurred: r.totalIncurred ? n(r.totalIncurred) : null,
        totalRecovery: r.totalRecovery ? n(r.totalRecovery) : null,
        totalSalvage: r.totalSalvage ? n(r.totalSalvage) : null,
        isTatBreach: r.isTatBreach,
        daysOverSla,
        // Delta fields
        prevStatus: flags?.['prev_status'] as string ?? null,
        prevValue: flags?.['prev_total_incurred'] != null ? n(flags['prev_total_incurred']) : null,
        // Parts backorder
        hasAcknowledgedDelay: delay?.hasDelay ?? false,
        expectedDate: delay?.expectedDate ?? null,
        // Finalised
        daysToFinalise: r.daysOpen ?? r.daysInCurrentStatus ?? null,
        netPaid: r.totalPaid && r.totalRecovery && r.totalSalvage
          ? n(r.totalPaid)! - n(r.totalRecovery)! - n(r.totalSalvage)!
          : r.totalPaid ? n(r.totalPaid) : null,
      };
    });

    // Build summary extras
    const tatBreachCount = type === 'handler'
      ? await prisma.claimSnapshot.count({ where: { ...baseWhere, isTatBreach: true } })
      : undefined;

    const worstBreachDays = type === 'sla_breaches' ? (agg._max.daysInCurrentStatus ?? 0) : undefined;
    const latestPaymentDate = type === 'unassigned_payment'
      ? await prisma.payment.findFirst({ orderBy: { printedDate: 'desc' }, select: { printedDate: true } })
          .then(r => r?.printedDate?.toISOString() ?? null)
      : undefined;

    return NextResponse.json({
      summary: {
        totalClaims: total,
        totalIncurred: agg._sum.totalIncurred ? n(agg._sum.totalIncurred) ?? 0 : 0,
        totalOutstanding: agg._sum.totalOs ? n(agg._sum.totalOs) ?? 0 : 0,
        totalPaid: agg._sum.totalPaid ? n(agg._sum.totalPaid) ?? 0 : 0,
        avgDaysInStatus: agg._avg.daysInCurrentStatus ? Math.round(Number(agg._avg.daysInCurrentStatus) * 10) / 10 : 0,
        byHandler: byHandlerRaw.map(r => ({ handler: r.handler ?? 'Unassigned', count: r._count.claimId })),
        byStatus: byStatusRaw.map(r => ({ status: r.secondaryStatus ?? 'Unknown', count: r._count.claimId })),
        byCause: byCauseRaw.map(r => ({ cause: r.cause ?? 'Unknown', count: r._count.claimId })),
        byArea: byAreaRaw.map(r => ({ area: r.lossArea ?? 'Unknown', count: r._count.claimId })),
        worstBreachDays,
        avgDaysOverSla: worstBreachDays != null ? worstBreachDays : undefined,
        tatBreachCount,
        latestPaymentDate: latestPaymentDate ?? undefined,
      },
      claims,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
