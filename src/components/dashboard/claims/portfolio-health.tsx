'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
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
  reserveHeatmap: Array<{ handler: string; claimType: string; count: number; severity: 'ok' | 'amber' | 'red' }>;
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

const SEVERITY_BG: Record<string, string> = {
  ok: 'bg-[#D1FAE5] text-[#065F46]',
  amber: 'bg-[#FFF9EC] text-[#92400E]',
  red: 'bg-[#FEE2E2] text-[#991B1B]',
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

  // Heatmap derived data
  const heatmapHandlers = useMemo(() => {
    const s = new Set((data?.reserveHeatmap ?? []).map(r => r.handler));
    return Array.from(s);
  }, [data]);
  const heatmapTypes = useMemo(() => {
    const s = new Set((data?.reserveHeatmap ?? []).map(r => r.claimType));
    return Array.from(s);
  }, [data]);
  const heatmapMap = useMemo(() => {
    const m: Record<string, PortfolioHealthData['reserveHeatmap'][number]> = {};
    for (const r of data?.reserveHeatmap ?? []) {
      m[`${r.handler}||${r.claimType}`] = r;
    }
    return m;
  }, [data]);

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

      {/* Reserve adequacy heatmap */}
      <section>
        <h2 className="text-base font-semibold text-[#0D2761] mb-3">Reserve adequacy heatmap</h2>
        {heatmapHandlers.length === 0 ? (
          <p className="text-sm text-[#6B7280]">{EMPTY}</p>
        ) : (
          <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                  <th className="px-4 py-2 text-left font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                    Handler
                  </th>
                  {heatmapTypes.map(t => (
                    <th key={t} className="px-4 py-2 text-center font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapHandlers.map(handler => (
                  <tr key={handler} className="border-b border-[#E8EEF8] last:border-0">
                    <td className="px-4 py-2 font-medium text-[#0D2761] whitespace-nowrap">{handler}</td>
                    {heatmapTypes.map(claimType => {
                      const cell = heatmapMap[`${handler}||${claimType}`];
                      return (
                        <td key={claimType} className="px-4 py-2 text-center">
                          {cell ? (
                            <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold ${SEVERITY_BG[cell.severity]}`}>
                              {cell.count}
                            </span>
                          ) : (
                            <span className="text-[#E8EEF8]">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
