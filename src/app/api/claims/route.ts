import { requireAuth } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

function serializeSnapshot(s: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (v instanceof Date) {
      out[k] = v.toISOString();
    } else if (v !== null && typeof v === 'object' && 'toFixed' in v) {
      // Prisma Decimal
      out[k] = Number(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') ?? '50', 10)));
    const sortBy = searchParams.get('sortBy') ?? 'claimId';
    const sortDir = (searchParams.get('sortDir') ?? 'asc') === 'desc' ? 'desc' : 'asc';

    // Filters
    const handlerFilter = searchParams.get('handler');
    const claimStatusFilter = searchParams.get('claimStatus');
    const secondaryStatusFilter = searchParams.get('secondaryStatus');
    const causeFilter = searchParams.get('cause');
    const brokerFilter = searchParams.get('broker');
    const isTatBreach = searchParams.get('isTatBreach');
    let snapshotDateParam = searchParams.get('snapshotDate');

    // Get latest snapshot date if not specified
    if (!snapshotDateParam) {
      const latest = await prisma.$queryRaw<{ max: Date | null }[]>`
        SELECT MAX(snapshot_date) as max FROM claim_snapshots
      `;
      const maxDate = latest[0]?.max;
      if (!maxDate) {
        return Response.json({ data: [], total: 0, page, pageSize, snapshotDate: null });
      }
      snapshotDateParam = maxDate instanceof Date ? maxDate.toISOString().split('T')[0] : String(maxDate);
    }

    const snapshotDate = new Date(snapshotDateParam);

    // Build where clause
    const where: Prisma.ClaimSnapshotWhereInput = {
      snapshotDate,
    };

    // Role-based filtering: CLAIMS_TECHNICIAN sees only their claims
    if (ctx.role === 'CLAIMS_TECHNICIAN' && ctx.fullName) {
      where.handler = ctx.fullName;
    } else if (handlerFilter) {
      where.handler = { contains: handlerFilter, mode: 'insensitive' };
    }

    if (claimStatusFilter) where.claimStatus = claimStatusFilter;
    if (secondaryStatusFilter) where.secondaryStatus = secondaryStatusFilter;
    if (causeFilter) where.cause = { contains: causeFilter, mode: 'insensitive' };
    if (brokerFilter) where.broker = { contains: brokerFilter, mode: 'insensitive' };
    if (isTatBreach === 'true') where.isTatBreach = true;
    if (isTatBreach === 'false') where.isTatBreach = false;

    // Valid sort columns
    const validSortCols: Record<string, string> = {
      claimId: 'claim_id',
      handler: 'handler',
      insured: 'insured',
      cause: 'cause',
      claimStatus: 'claim_status',
      secondaryStatus: 'secondary_status',
      daysInCurrentStatus: 'days_in_current_status',
      totalIncurred: 'total_incurred',
      totalOs: 'total_os',
      snapshotDate: 'snapshot_date',
    };

    const orderByField = (validSortCols[sortBy] ? sortBy : 'claimId') as keyof Prisma.ClaimSnapshotOrderByWithRelationInput;

    const [total, snapshots] = await Promise.all([
      prisma.claimSnapshot.count({ where }),
      prisma.claimSnapshot.findMany({
        where,
        orderBy: { [orderByField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Get SLA configs to join priority
    const tatConfigs = await prisma.tatConfig.findMany({ where: { isActive: true } });
    const slaMap = new Map(tatConfigs.map(c => [c.secondaryStatus, c]));

    const data = snapshots.map(s => {
      const sla = s.secondaryStatus ? slaMap.get(s.secondaryStatus) : null;
      return {
        ...serializeSnapshot(s as unknown as Record<string, unknown>),
        slaPriority: sla?.priority ?? null,
        slaMaxDays: sla?.maxDays ?? null,
      };
    });

    return Response.json({
      data,
      total,
      page,
      pageSize,
      snapshotDate: snapshotDate.toISOString().split('T')[0],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({ error: msg }, { status: 500 });
  }
}
