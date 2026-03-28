'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '@/components/dashboard/types';

interface BrokerLensData {
  brokers: Array<{
    broker: string;
    claimCount: number;
    lossRatio: number | null;
    avgNotificationGap: number | null;
    repudiationRate: number | null;
    avgClaimValue: number | null;
    openClaims: number;
  }>;
  claims: Array<{
    claimId: string;
    broker: string | null;
    handler: string | null;
    claimStatus: string | null;
    cause: string | null;
    totalIncurred: number | null;
    daysOpen: number | null;
  }>;
  hasRevenueData: boolean;
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

type ClaimRow = BrokerLensData['claims'][number];
const colHelper = createColumnHelper<ClaimRow>();

const EMPTY = 'No data yet — import a Claims Outstanding report to populate the dashboard.';
type Selection = 'top5' | 'bottom5' | 'all';
type SortKey = 'claimCount' | 'lossRatio' | 'avgNotificationGap';

export function BrokerLens({ userId: _userId, filters }: SubViewProps) {
  const [data, setData] = useState<BrokerLensData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection>('top5');
  const [sortKey, setSortKey] = useState<SortKey>('claimCount');
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    const keys = Object.keys(filters) as (keyof FilterState)[];
    for (const k of keys) {
      const v = filters[k] as string;
      if (v) params.set(k, v);
    }
    fetch(`/api/dashboard/claims/broker-lens?${params}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then((json: BrokerLensData | null) => { if (json) setData(json); })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [filters]);

  const sortedBrokers = useMemo(() => {
    if (!data) return [];
    return [...data.brokers].sort((a, b) => {
      if (sortKey === 'lossRatio') return (b.lossRatio ?? 0) - (a.lossRatio ?? 0);
      if (sortKey === 'avgNotificationGap') return (b.avgNotificationGap ?? 0) - (a.avgNotificationGap ?? 0);
      return b.claimCount - a.claimCount;
    });
  }, [data, sortKey]);

  const displayedBrokers = useMemo(() => {
    if (selection === 'top5') return sortedBrokers.slice(0, 5);
    if (selection === 'bottom5') return sortedBrokers.slice(-5).reverse();
    return sortedBrokers;
  }, [sortedBrokers, selection]);

  const chartData = useMemo(() =>
    displayedBrokers.map(b => ({ name: b.broker, count: b.claimCount })),
    [displayedBrokers]
  );

  const filteredClaims = useMemo(() => {
    if (!data) return [];
    if (!selectedBroker) return data.claims;
    return data.claims.filter(c => c.broker === selectedBroker);
  }, [data, selectedBroker]);

  const columns = useMemo(() => [
    colHelper.accessor('claimId', {
      header: 'Claim ID',
      cell: i => (
        <Link href={`/claims/${encodeURIComponent(i.getValue())}`} className="font-mono text-[#1E5BC6] text-xs hover:underline">
          {i.getValue()}
        </Link>
      ),
    }),
    colHelper.accessor('broker', {
      header: 'Broker',
      cell: i => <span className="text-sm text-[#0D2761]">{i.getValue() ?? '—'}</span>,
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
    colHelper.accessor('totalIncurred', {
      header: 'Total incurred',
      cell: i => <span className="text-sm tabular-nums">{formatZAR(i.getValue())}</span>,
    }),
    colHelper.accessor('daysOpen', {
      header: 'Days open',
      cell: i => <span className="text-sm tabular-nums">{i.getValue() ?? '—'}</span>,
    }),
  ], []);

  const table = useReactTable({
    data: filteredClaims,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

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

  const selectionLabels: Record<Selection, string> = {
    top5: 'Top 5 brokers',
    bottom5: 'Bottom 5 brokers',
    all: 'All brokers',
  };

  return (
    <div className="space-y-8">
      {/* Toggle row */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['top5', 'bottom5', 'all'] as Selection[]).map(s => (
          <button
            key={s}
            onClick={() => setSelection(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selection === s
                ? 'bg-[#0D2761] text-white'
                : 'text-[#6B7280] border border-[#E8EEF8] hover:bg-[#F4F6FA]'
            }`}
          >
            {selectionLabels[s]}
          </button>
        ))}

        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="ml-auto text-sm border border-[#E8EEF8] rounded-lg px-3 py-2 text-[#0D2761] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
        >
          <option value="claimCount">Sort by: Claim count</option>
          <option value="lossRatio">Sort by: Loss ratio</option>
          <option value="avgNotificationGap">Sort by: Avg notification gap</option>
        </select>
      </div>

      {/* Bar chart */}
      {chartData.length === 0 ? (
        <p className="text-sm text-[#6B7280]">{EMPTY}</p>
      ) : (
        <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
          <p className="text-sm font-semibold text-[#0D2761] mb-3">Claims by broker</p>
          <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7280' }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: '#0D2761' }} />
              <Tooltip cursor={{ fill: '#F4F6FA' }} />
              <Bar dataKey="count" radius={[0, 3, 3, 0]} onClick={(d) => setSelectedBroker((d.name ?? null) === selectedBroker ? null : (d.name ?? null))}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.name === selectedBroker ? '#0D2761' : '#1E5BC6'}
                    cursor="pointer"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {selectedBroker && (
            <p className="text-xs text-[#6B7280] mt-2">
              Filtered to: <span className="font-semibold text-[#0D2761]">{selectedBroker}</span>{' '}
              <button onClick={() => setSelectedBroker(null)} className="text-[#1E5BC6] hover:underline ml-1">
                Clear
              </button>
            </p>
          )}
        </div>
      )}

      {/* Broker metric cards */}
      {displayedBrokers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedBrokers.slice(0, 5).map(b => (
            <button
              key={b.broker}
              onClick={() => setSelectedBroker(b.broker === selectedBroker ? null : b.broker)}
              className={`text-left bg-white rounded-xl border shadow-sm p-4 transition-colors hover:border-[#1E5BC6] ${
                b.broker === selectedBroker ? 'border-[#0D2761] ring-2 ring-[#0D2761]' : 'border-[#E8EEF8]'
              }`}
            >
              <p className="font-semibold text-[#0D2761] text-sm truncate">{b.broker}</p>
              <dl className="mt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <dt className="text-[#6B7280]">Claims submitted</dt>
                  <dd className="font-medium text-[#0D2761] tabular-nums">{b.claimCount}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-[#6B7280]">Loss ratio</dt>
                  <dd className="font-medium text-[#0D2761] tabular-nums">
                    {data.hasRevenueData
                      ? b.lossRatio !== null ? `${b.lossRatio}%` : '—'
                      : <span className="text-[#6B7280] italic">Upload Revenue Analysis to calculate</span>}
                  </dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-[#6B7280]">Avg notification gap</dt>
                  <dd className="font-medium text-[#0D2761] tabular-nums">
                    {b.avgNotificationGap !== null ? `${b.avgNotificationGap} days` : '—'}
                  </dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-[#6B7280]">Repudiation rate</dt>
                  <dd className="font-medium text-[#0D2761] tabular-nums">
                    {b.repudiationRate !== null ? `${b.repudiationRate}%` : '—'}
                  </dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-[#6B7280]">Avg claim value</dt>
                  <dd className="font-medium text-[#0D2761] tabular-nums">{formatZAR(b.avgClaimValue)}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-[#6B7280]">Open claims</dt>
                  <dd className="font-medium text-[#0D2761] tabular-nums">{b.openClaims}</dd>
                </div>
              </dl>
            </button>
          ))}
        </div>
      )}

      {/* Claims table */}
      <section>
        <h2 className="text-base font-semibold text-[#0D2761] mb-3">
          Claims{selectedBroker ? ` — ${selectedBroker}` : ' — all brokers'}
        </h2>
        {filteredClaims.length === 0 ? (
          <p className="text-sm text-[#6B7280]">{EMPTY}</p>
        ) : (
          <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map(hg => (
                    <tr key={hg.id} className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                      {hg.headers.map(header => (
                        <th key={header.id} className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                          {flexRender(header.column.columnDef.header, header.getContext())}
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
          </div>
        )}
      </section>
    </div>
  );
}
