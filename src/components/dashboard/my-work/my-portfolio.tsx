'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '@/components/dashboard/types';

interface MyWorkSubViewProps {
  role: UserRole;
  userId: string;
  filters: FilterState;
  handlerName: string;
  onHandlerChange: (name: string) => void;
}

interface ClaimRow {
  claimId: string;
  claimStatus: string | null;
  secondaryStatus: string | null;
  cause: string | null;
  daysOpen: number | null;
  totalIncurred: number | null;
  totalOs: number | null;
  slaPosition: 'on-track' | 'at-risk' | 'breach';
  hasActiveDelay: boolean;
}

interface MyPortfolioData {
  stats: {
    openClaims: number;
    totalOutstanding: number;
    slaBreaches: number;
    activeDelays: number;
  };
  claims: ClaimRow[];
  handlers?: string[];
}

function formatZAR(value: number | null): string {
  if (value === null) return 'R —';
  return 'R ' + value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function HandlerSelector({
  role,
  handlers,
  selected,
  onHandlerChange,
}: {
  role: UserRole;
  handlers: string[];
  selected: string;
  onHandlerChange: (name: string) => void;
}) {
  const showAllOption =
    role === 'TEAM_LEADER' || role === 'HEAD_OF_CLAIMS' || role === 'SENIOR_MANAGEMENT';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#6B7280] font-medium">Viewing:</span>
      <select
        value={selected}
        onChange={(e) => onHandlerChange(e.target.value)}
        className="text-sm border border-[#E8EEF8] rounded-md px-2 py-1 text-[#0D2761] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
      >
        {showAllOption && <option value="__all__">All handlers</option>}
        {handlers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}

const slaBorderMap: Record<ClaimRow['slaPosition'], string> = {
  breach: 'border-l-red-500',
  'at-risk': 'border-l-[#F5A800]',
  'on-track': 'border-l-green-500',
};

const slaBadgeMap: Record<ClaimRow['slaPosition'], string> = {
  breach: 'bg-red-100 text-red-700',
  'at-risk': 'bg-amber-100 text-amber-700',
  'on-track': 'bg-green-100 text-green-700',
};

const slaLabelMap: Record<ClaimRow['slaPosition'], string> = {
  breach: 'Breach',
  'at-risk': 'At risk',
  'on-track': 'On track',
};

const columnHelper = createColumnHelper<ClaimRow>();

export default function MyPortfolio({
  role,
  filters,
  handlerName,
  onHandlerChange,
}: MyWorkSubViewProps) {
  const [data, setData] = useState<MyPortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  const fetchData = useCallback(
    (signal: AbortSignal) => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ handler: handlerName });
      // Append active filters
      (Object.keys(filters) as (keyof FilterState)[]).forEach((key) => {
        const val = filters[key];
        if (val) params.set(key, String(val));
      });

      fetch(`/api/dashboard/my-work/portfolio?${params}`, { signal })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<MyPortfolioData>;
        })
        .then((json) => {
          setData(json);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          setError(err instanceof Error ? err.message : 'Failed to load');
          setLoading(false);
        });
    },
    [handlerName, filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('claimId', {
        header: 'Claim ID',
        cell: (info) => (
          <Link
            href={`/claims/${info.getValue()}`}
            className="text-[#1E5BC6] hover:text-[#0D2761] font-medium text-sm"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor('claimStatus', {
        header: 'Status',
        cell: (info) => (
          <span className="text-sm text-[#6B7280]">{info.getValue() ?? '—'}</span>
        ),
      }),
      columnHelper.accessor('secondaryStatus', {
        header: 'Secondary status',
        cell: (info) => (
          <span className="text-sm text-[#6B7280]">{info.getValue() ?? '—'}</span>
        ),
      }),
      columnHelper.accessor('cause', {
        header: 'Cause',
        cell: (info) => (
          <span className="text-sm text-[#6B7280]">{info.getValue() ?? '—'}</span>
        ),
      }),
      columnHelper.accessor('daysOpen', {
        header: 'Days open',
        cell: (info) => (
          <span className="text-sm text-[#6B7280]">
            {info.getValue() !== null ? info.getValue() : '—'}
          </span>
        ),
      }),
      columnHelper.accessor('totalIncurred', {
        header: 'Total incurred',
        cell: (info) => (
          <span className="text-sm text-[#0D2761]">{formatZAR(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor('totalOs', {
        header: 'Outstanding',
        cell: (info) => (
          <span className="text-sm text-[#0D2761]">{formatZAR(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor('slaPosition', {
        header: 'SLA',
        cell: (info) => {
          const val = info.getValue();
          return (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${slaBadgeMap[val]}`}
            >
              {slaLabelMap[val]}
            </span>
          );
        },
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: data?.claims ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  if (loading) {
    return <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />;
  }

  if (error || !data) {
    return (
      <div className="text-sm text-red-500 p-4">{error ?? 'No data available.'}</div>
    );
  }

  const handlers = data.handlers ?? [];

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-sm font-bold tracking-widest text-[#0D2761] uppercase">
          My portfolio
        </h2>
        <HandlerSelector
          role={role}
          handlers={handlers}
          selected={handlerName}
          onHandlerChange={onHandlerChange}
        />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Open claims" value={String(data.stats.openClaims)} />
        <StatCard
          label="Total outstanding"
          value={formatZAR(data.stats.totalOutstanding)}
        />
        <StatCard
          label="SLA breaches"
          value={String(data.stats.slaBreaches)}
          highlight={data.stats.slaBreaches > 0 ? 'red' : undefined}
        />
        <StatCard
          label="Active delays"
          value={String(data.stats.activeDelays)}
          highlight={data.stats.activeDelays > 0 ? 'amber' : undefined}
        />
      </div>

      {/* Table */}
      {data.claims.length === 0 ? (
        <p className="text-sm text-[#6B7280] py-6 text-center">
          No claims in portfolio.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-[#E8EEF8]">
            <table className="w-full text-left">
              <thead className="bg-[#F8FAFF]">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-3 py-2.5 text-xs font-semibold text-[#0D2761] uppercase tracking-wider whitespace-nowrap cursor-pointer select-none"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <>
                              {header.column.getIsSorted() === 'asc' && (
                                <ChevronUp className="w-3 h-3" strokeWidth={2} />
                              )}
                              {header.column.getIsSorted() === 'desc' && (
                                <ChevronDown className="w-3 h-3" strokeWidth={2} />
                              )}
                              {!header.column.getIsSorted() && (
                                <ChevronsUpDown className="w-3 h-3 text-[#6B7280]" strokeWidth={2} />
                              )}
                            </>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-[#E8EEF8]">
                {table.getRowModel().rows.map((row) => {
                  const sla = row.original.slaPosition;
                  return (
                    <tr
                      key={row.id}
                      className={`bg-white border-l-[3px] ${slaBorderMap[sla]} hover:bg-[#F8FAFF] transition-colors`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2.5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3 px-1">
            <span className="text-xs text-[#6B7280]">
              Page {table.getState().pagination.pageIndex + 1} of{' '}
              {table.getPageCount()} &mdash; {data.claims.length} claims
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="p-1 rounded border border-[#E8EEF8] disabled:opacity-40 hover:bg-[#F8FAFF]"
              >
                <ChevronLeft className="w-4 h-4 text-[#0D2761]" strokeWidth={2} />
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="p-1 rounded border border-[#E8EEF8] disabled:opacity-40 hover:bg-[#F8FAFF]"
              >
                <ChevronRight className="w-4 h-4 text-[#0D2761]" strokeWidth={2} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'red' | 'amber';
}) {
  const valueColor =
    highlight === 'red'
      ? 'text-red-600'
      : highlight === 'amber'
      ? 'text-[#F5A800]'
      : 'text-[#0D2761]';

  return (
    <div className="bg-white border border-[#E8EEF8] rounded-lg p-4">
      <p className="text-xs text-[#6B7280] font-medium mb-1">{label}</p>
      <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}
