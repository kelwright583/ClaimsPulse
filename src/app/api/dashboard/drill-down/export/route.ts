import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import type { Prisma } from '@prisma/client';

const ALLOWED_ROLES = ['HEAD_OF_CLAIMS', 'TEAM_LEADER'] as const;

function n(v: unknown): number | null {
  if (v == null) return null;
  const num = Number(v);
  return isNaN(num) ? null : num;
}

function fmtR(v: number | null | undefined): string {
  if (v == null) return '';
  return `R ${Math.round(v).toLocaleString('en-ZA')}`;
}

function fmtDate(v: Date | string | null | undefined): string {
  if (!v) return '';
  const s = v instanceof Date ? v.toISOString() : v;
  return s.split('T')[0];
}

function buildBaseWhere(
  type: string,
  snapshotDate: Date,
  params: URLSearchParams,
  applyUserFilters: boolean
): Prisma.ClaimSnapshotWhereInput {
  const base: Prisma.ClaimSnapshotWhereInput = { snapshotDate };

  switch (type) {
    case 'sla_breaches':
      base.isSlaBreach = true;
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
  }

  if (!applyUserFilters) return base;

  const handler = params.get('handler');
  const status = params.get('status');
  const cause = params.get('cause');
  const area = params.get('area');
  const from = params.get('from');
  const to = params.get('to');

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

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

async function toXlsx(
  rows: Record<string, unknown>[],
  title: string
): Promise<Buffer> {
  const xlsx = await import('xlsx');
  const wb = xlsx.utils.book_new();
  const headerRow = [title, '', '', `Exported ${new Date().toLocaleDateString('en-ZA')}`];
  const ws = xlsx.utils.aoa_to_sheet([headerRow]);
  xlsx.utils.sheet_add_json(ws, rows, { origin: 'A2' });
  xlsx.utils.book_append_sheet(wb, ws, 'Export');
  const buf = xlsx.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  return Buffer.from(buf);
}

function titleForType(type: string): string {
  const map: Record<string, string> = {
    sla_breaches: 'SLA Breaches',
    red_flags: 'Red Flags',
    big_claims: 'Big Claims Open',
    unassigned_payment: 'Unassigned + Payment',
    ready_to_close: 'Ready to Close',
    newly_breached: 'Newly Breached SLA',
    value_jumps: 'Value Jumps',
    stagnant: 'Stagnant Claims',
    handler: 'Handler Portfolio',
  };
  return map[type] ?? type;
}

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') ?? 'sla_breaches';
    const format = searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';
    const scope = searchParams.get('scope') === 'full' ? 'full' : 'filtered';
    const applyUserFilters = scope === 'filtered';

    const latestDate = await prisma.claimSnapshot.findFirst({
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    });

    if (!latestDate) {
      return new NextResponse('No data', { status: 404 });
    }

    const today = new Date().toLocaleDateString('en-ZA');
    const title = `${titleForType(type)} — Exported ${today}`;

    if (type === 'red_flags') {
      const flags = await prisma.claimFlag.findMany({
        where: { detail: { path: ['actioned'], equals: false } },
        orderBy: { createdAt: 'asc' },
        select: { claimId: true, flagType: true, detail: true, createdAt: true },
      });
      const rows = flags.map(f => {
        const d = f.detail as Record<string, unknown> | null;
        return {
          'Claim': f.claimId,
          'Flag type': f.flagType,
          'Flag detail': d ? (d['message'] ?? d['detail'] ?? JSON.stringify(d)) : '',
          'Date flagged': fmtDate(f.createdAt),
        };
      });
      return sendFile(rows, format, title, type);
    }

    const where = buildBaseWhere(type, latestDate.snapshotDate, searchParams, applyUserFilters);
    const snapshots = await prisma.claimSnapshot.findMany({
      where,
      orderBy: { totalIncurred: 'desc' },
      select: {
        claimId: true, handler: true, claimStatus: true, secondaryStatus: true,
        cause: true, lossArea: true, insured: true, broker: true,
        dateOfLoss: true, daysInCurrentStatus: true, daysOpen: true,
        intimatedAmount: true, totalPaid: true, totalOs: true, totalIncurred: true,
        totalRecovery: true, totalSalvage: true, isSlaBreach: true,
        ownDamagePaid: true, thirdPartyPaid: true, expensesPaid: true,
        legalCostsPaid: true, assessorFeesPaid: true, towingPaid: true,
      },
    });

    const rows = snapshots.map(r => ({
      'Claim': r.claimId,
      'Handler': r.handler ?? '',
      'Status': r.claimStatus ?? '',
      'Secondary status': r.secondaryStatus ?? '',
      'Cause': r.cause ?? '',
      'Loss area': r.lossArea ?? '',
      'Insured': r.insured ?? '',
      'Broker': r.broker ?? '',
      'Date of loss': fmtDate(r.dateOfLoss),
      'Days in status': r.daysInCurrentStatus ?? '',
      'Days open': r.daysOpen ?? '',
      'Intimated amount': fmtR(n(r.intimatedAmount)),
      'Total paid': fmtR(n(r.totalPaid)),
      'Total outstanding': fmtR(n(r.totalOs)),
      'Total incurred': fmtR(n(r.totalIncurred)),
      'Total recovery': fmtR(n(r.totalRecovery)),
      'Total salvage': fmtR(n(r.totalSalvage)),
      'SLA breach': r.isSlaBreach ? 'Yes' : 'No',
      'Own damage paid': fmtR(n(r.ownDamagePaid)),
      'Third party paid': fmtR(n(r.thirdPartyPaid)),
      'Expenses paid': fmtR(n(r.expensesPaid)),
      'Legal costs paid': fmtR(n(r.legalCostsPaid)),
      'Assessor fees paid': fmtR(n(r.assessorFeesPaid)),
      'Towing paid': fmtR(n(r.towingPaid)),
    }));

    return sendFile(rows, format, title, type);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function sendFile(
  rows: Record<string, unknown>[],
  format: 'csv' | 'xlsx',
  title: string,
  type: string
) {
  const today = new Date().toISOString().split('T')[0];
  if (format === 'xlsx') {
    const buf = await toXlsx(rows, title);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${type}-${today}.xlsx"`,
      },
    });
  }
  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${type}-${today}.csv"`,
    },
  });
}
