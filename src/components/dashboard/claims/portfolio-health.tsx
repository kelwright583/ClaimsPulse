'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { DrillDownModal } from '@/components/drill-down/DrillDownModal';
import type { DrillDownContext } from '@/components/drill-down/types';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '@/components/dashboard/types';

interface ReserveByCause {
  cause: string;
  claimCount: number;
  avgReserve: number;
  avgCost: number;
  gapPct: number;
  totalOutstanding: number;
  utilisationPct: number;
}

interface ReserveSummary {
  totalClaims: number;
  avgReserve: number;
  avgCost: number;
  gap: number;
  totalOutstanding: number;
}

interface PortfolioHealthData {
  stats: {
    totalOpen: number;
    totalOutstanding: number;
    totalIncurredMtd: number;
    avgDaysOpen: number;
  };
  byStatus: Array<{ status: string; count: number }>;
  byCause: Array<{ cause: string; count: number }>;
  outstandingTrend: Array<{ week: string; totalOs: number }>;
  reserveSummary: ReserveSummary;
  reserveByCause: ReserveByCause[];
  claims: Array<{
    claimId: string;
    handler: string | null;
    claimStatus: string | null;
    secondaryStatus: string | null;
    cause: string | null;
    daysOpen: number | null;
    totalIncurred: number | null;
    totalOs: number | null;
    slaPosition: 'on-track' | 'at-risk' | 'breach';
  }>;
}

interface SubViewProps {
  role: UserRole;
  userId: string;
  filters: FilterState;
}

function formatZAR(value: number | null) {
  if (value === null) return '—';
  return 'R ' + value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function useCountUp(target: number, duration = 800) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const steps = 30;
    const interval = duration / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += 1;
      setCount(Math.round((target * current) / steps));
      if (current >= steps) { clearInterval(timer); setCount(target); }
    }, interval);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

const STATUS_COLORS: Record<string, string> = {
  Processing: '#1E5BC6',
  Finalised: '#059669',
  'Re-opened': '#F5A800',
  Repudiated: '#E24B4A',
  Cancelled: '#9CA3AF',
};
const DEFAULT_PIE_COLOR = '#6B7280';

const SLA_CHIP: Record<string, string> = {
  'on-track': 'bg-[#D1FAE5] text-[#065F46]',
  'at-risk': 'bg-[#FFF9EC] text-[#92400E]',
  breach: 'bg-[#FEE2E2] text-[#991B1B]',
};
const SLA_LABEL: Record<string, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  breach: 'Breach',
};

type ClaimRow = PortfolioHealthData['claims'][number];
const colHelper = createColumnHelper<ClaimRow>();

const EMPTY = 'No data yet — import a Claims Outstanding report to populate the dashboard.';

function StatCard({ label, value, prefix = '' }: { label: string; value: number; prefix?: string }) {
  const count = useCountUp(value);
  return (
    <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
      <p className="text-xs text-[#6B7280] uppercase tracking-wide font-medium">{label}</p>
      <p className="text-2xl font-bold text-[#0D2761] mt-1 tabular-nums">
        {prefix}{count.toLocaleString('en-ZA')}
      </p>
    </div>
  );
}

export function PortfolioHealth({ userId: _userId, filters }: SubViewProps) {
  const [data, setData] = useState<PortfolioHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(0);
  const [drillDown, setDrillDown] = useState<DrillDownContext | null>(null);
  const PAGE_SIZE = 25;

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    const keys = Object.keys(filters) as (keyof FilterState)[];
    for (const k of keys) {
      const v = filters[k] as string;
      if (v) params.set(k, v);
    }
    fetch(`/api/dashboard/claims/portfolio-health?${params}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then((json: PortfolioHealthData | null) => { if (json) setData(json); })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [filters]);

  const columns = useMemo(() => [
    colHelper.accessor('claimId', {
      header: 'Claim ID',
      cell: i => (
        <Link href={`/claims/${encodeURIComponent(i.getValue())}`} className="font-mono text-[#1E5BC6] text-xs hover:underline">
          {i.getValue()}
        </Link>
      ),
    }),
    colHelper.accessor('handler', {
      header: 'Handler',
      cell: i => <span className="text-sm text-[#0D2761]">{i.getValue() ?? '—'}</span>,
    }),
    colHelper.accessor('claimStatus', {
      header: 'Status',
      cell: i => <span className="text-sm text-[#0D2761]">{i.getValue() ?? '—'}</span>,
    }),
    colHelper.accessor('cause', {
      header: 'Cause',
      cell: i => <span className="text-sm text-[#6B7280]">{i.getValue() ?? '—'}</span>,
    }),
    colHelper.accessor('daysOpen', {
      header: 'Days open',
      cell: i => <span className="text-sm tabular-nums text-[#0D2761]">{i.getValue() ?? '—'}</span>,
    }),
    colHelper.accessor('totalIncurred', {
      header: 'Total incurred',
      cell: i => <span className="text-sm tabular-nums text-right block">{formatZAR(i.getValue())}</span>,
    }),
    colHelper.accessor('totalOs', {
      header: 'Outstanding',
      cell: i => <span className="text-sm tabular-nums text-right block">{formatZAR(i.getValue())}</span>,
    }),
    colHelper.accessor('slaPosition', {
      header: 'SLA',
      cell: i => {
        const v = i.getValue();
        return (
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${SLA_CHIP[v] ?? ''}`}>
            {SLA_LABEL[v] ?? v}
          </span>
        );
      },
    }),
  ], []);

  const table = useReactTable({
    data: data?.claims ?? [],
    columns,
    state: { sorting, pagination: { pageIndex: page, pageSize: PAGE_SIZE } },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const totalPages = table.getPageCount();

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />
        <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-[#6B7280]">{EMPTY}</p>;
  }

  const top8Causes = [...(data.byCause ?? [])].sort((a, b) => b.count - a.count).slice(0, 8);

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total open claims" value={data.stats.totalOpen} />
        <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
          <p className="text-xs text-[#6B7280] uppercase tracking-wide font-medium">Total outstanding</p>
          <p className="text-2xl font-bold text-[#0D2761] mt-1 tabular-nums">{formatZAR(data.stats.totalOutstanding)}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
          <p className="text-xs text-[#6B7280] uppercase tracking-wide font-medium">Total incurred MTD</p>
          <p className="text-2xl font-bold text-[#0D2761] mt-1 tabular-nums">{formatZAR(data.stats.totalIncurredMtd)}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
          <p className="text-xs text-[#6B7280] uppercase tracking-wide font-medium">Avg days open</p>
          <p className="text-2xl font-bold text-[#0D2761] mt-1 tabular-nums">{data.stats.avgDaysOpen} days</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Donut chart — by status */}
        <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
          <p className="text-sm font-semibold text-[#0D2761] mb-3">Claims by status</p>
          {data.byStatus.length === 0 ? (
            <p className="text-xs text-[#6B7280]">{EMPTY}</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.byStatus}
                  dataKey="count"
                  nameKey="status"
                  innerRadius="55%"
                  outerRadius="80%"
                  paddingAngle={2}
                  label={false}
                >
                  {data.byStatus.map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[entry.status] ?? DEFAULT_PIE_COLOR} />
                  ))}
                </Pie>
                <Legend
                  formatter={(value: string) => (
                    <span className="text-xs text-[#6B7280]">{value}</span>
                  )}
                />
                <Tooltip formatter={(v: unknown) => [`${v}`, 'Claims'] as [string, string]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Horizontal bar — by cause */}
        <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
          <p className="text-sm font-semibold text-[#0D2761] mb-3">Top 8 causes</p>
          {top8Causes.length === 0 ? (
            <p className="text-xs text-[#6B7280]">{EMPTY}</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={top8Causes} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7280' }} />
                <YAxis
                  type="category"
                  dataKey="cause"
                  width={100}
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                />
                <Tooltip cursor={{ fill: '#F4F6FA' }} />
                <Bar dataKey="count" fill="#1E5BC6" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Line chart — outstanding trend */}
        <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
          <p className="text-sm font-semibold text-[#0D2761] mb-3">Outstanding trend</p>
          {data.outstandingTrend.length === 0 ? (
            <p className="text-xs text-[#6B7280]">{EMPTY}</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.outstandingTrend} margin={{ left: 0, right: 10 }}>
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#6B7280' }} />
                <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="totalOs"
                  stroke="#F5A800"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Reserve adequacy by cause */}
      <section>
        <h2 className="text-base font-semibold text-[#0D2761] mb-3">Reserve adequacy by cause</h2>
        {!data.reserveSummary || data.reserveByCause.length === 0 ? (
          <p className="text-sm text-[#6B7280]">{EMPTY}</p>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              <div className="bg-[#F4F6FA] rounded-lg p-3">
                <p className="text-xs text-[#6B7280]">Open claims</p>
                <p className="text-xl font-bold tabular-nums text-[#0D2761]">
                  {data.reserveSummary.totalClaims.toLocaleString()}
                </p>
              </div>
              <div className="bg-[#F4F6FA] rounded-lg p-3">
                <p className="text-xs text-[#6B7280]">Avg reserve set</p>
                <p className="text-xl font-bold tabular-nums text-[#0D2761]">
                  R{data.reserveSummary.avgReserve.toLocaleString()}
                </p>
              </div>
              <div className="bg-[#F4F6FA] rounded-lg p-3">
                <p className="text-xs text-[#6B7280]">Avg claim cost</p>
                <p className="text-xl font-bold tabular-nums text-[#0D2761]">
                  R{data.reserveSummary.avgCost.toLocaleString()}
                </p>
              </div>
              <div className={`rounded-lg p-3 ${data.reserveSummary.gap > 0 ? 'bg-[#FCEBEB]' : 'bg-[#EAF3DE]'}`}>
                <p className={`text-xs ${data.reserveSummary.gap > 0 ? 'text-[#791F1F]' : 'text-[#27500A]'}`}>
                  {data.reserveSummary.gap > 0 ? 'Avg cost exceeds reserve by' : 'Avg cost within reserve by'}
                </p>
                <p className={`text-xl font-bold tabular-nums ${data.reserveSummary.gap > 0 ? 'text-[#A32D2D]' : 'text-[#3B6D11]'}`}>
                  R{Math.abs(data.reserveSummary.gap).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Cause breakdown */}
            <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm overflow-hidden">
              <div className="grid grid-cols-[160px_1fr_90px_90px_70px] px-4 py-2.5 bg-[#F4F6FA] border-b border-[#E8EEF8]">
                <span className="text-[11px] font-semibold text-[#F5A800] uppercase tracking-wide">Cause</span>
                <span className="text-[11px] font-semibold text-[#F5A800] uppercase tracking-wide">Reserve vs actual cost</span>
                <span className="text-[11px] font-semibold text-[#F5A800] uppercase tracking-wide text-right">Avg reserve</span>
                <span className="text-[11px] font-semibold text-[#F5A800] uppercase tracking-wide text-right">Avg cost</span>
                <span className="text-[11px] font-semibold text-[#F5A800] uppercase tracking-wide text-right">Claims</span>
              </div>
              {data.reserveByCause.map(row => {
                const maxVal = Math.max(row.avgReserve, row.avgCost);
                const reserveBarWidth = maxVal > 0 ? (row.avgReserve / maxVal) * 95 : 0;
                const costMarkerPos = maxVal > 0 ? (row.avgCost / maxVal) * 95 : 0;
                const exceeds = row.gapPct > 0;
                return (
                  <div
                    key={row.cause}
                    onClick={() => setDrillDown({ type: 'reserve_by_handler', title: `Reserve adequacy — ${row.cause}`, cause: row.cause })}
                    className="grid grid-cols-[160px_1fr_90px_90px_70px] px-4 py-3 border-b border-[#E8EEF8] last:border-0 items-center cursor-pointer hover:bg-[#F4F6FA] transition-colors"
                  >
                    <span className="text-[13px] font-medium text-[#0D2761]">{row.cause}</span>
                    <div className="relative h-7 bg-[#F4F6FA] rounded mx-2">
                      <div
                        className="absolute left-0 top-1 h-5 bg-[#B5D4F4] rounded-sm"
                        style={{ width: `${reserveBarWidth}%` }}
                      />
                      <div
                        className={`absolute top-1 h-5 border-r-2 ${exceeds ? 'border-[#A32D2D]' : 'border-[#0F6E56]'}`}
                        style={{ left: `${costMarkerPos}%` }}
                      />
                      <span className={`absolute right-1 top-1.5 text-[10px] font-medium ${exceeds ? 'text-[#791F1F]' : 'text-[#085041]'}`}>
                        {exceeds ? '+' : ''}{row.gapPct}%
                      </span>
                    </div>
                    <span className="text-xs text-[#6B7280] text-right tabular-nums">
                      R{row.avgReserve.toLocaleString()}
                    </span>
                    <span className={`text-xs text-right tabular-nums font-medium ${exceeds ? 'text-[#A32D2D]' : 'text-[#085041]'}`}>
                      R{row.avgCost.toLocaleString()}
                    </span>
                    <span className="text-xs text-[#6B7280] text-right tabular-nums">{row.claimCount}</span>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-2.5 text-[11px] text-[#6B7280]">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#B5D4F4] inline-block" /> Avg reserve set
              </span>
              <span className="flex items-center gap-1">
                <span className="w-0.5 h-2.5 bg-[#A32D2D] inline-block" /> Actual cost exceeds reserve
              </span>
              <span className="flex items-center gap-1">
                <span className="w-0.5 h-2.5 bg-[#0F6E56] inline-block" /> Actual cost within reserve
              </span>
            </div>
          </>
        )}
      </section>

      {/* Drill-down modal */}
      {drillDown && (
        <DrillDownModal context={drillDown} onClose={() => setDrillDown(null)} />
      )}

      {/* Claims table */}
      <section>
        <h2 className="text-base font-semibold text-[#0D2761] mb-3">Claims</h2>
        {data.claims.length === 0 ? (
          <p className="text-sm text-[#6B7280]">{EMPTY}</p>
        ) : (
          <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map(hg => (
                    <tr key={hg.id} className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                      {hg.headers.map(header => (
                        <th
                          key={header.id}
                          className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-[#0D2761]"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <div className="flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getIsSorted() === 'asc' && <span>↑</span>}
                            {header.column.getIsSorted() === 'desc' && <span>↓</span>}
                          </div>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map(row => (
                    <tr key={row.id} className="border-b border-[#E8EEF8] last:border-0 hover:bg-[#F4F6FA] transition-colors">
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#E8EEF8] bg-[#F4F6FA]">
              <p className="text-xs text-[#6B7280]">
                Page <span className="font-semibold text-[#0D2761]">{page + 1}</span> of{' '}
                <span className="font-semibold text-[#0D2761]">{totalPages || 1}</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-xs font-medium text-[#6B7280] border border-[#E8EEF8] rounded-md hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 text-xs font-medium text-[#6B7280] border border-[#E8EEF8] rounded-md hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
