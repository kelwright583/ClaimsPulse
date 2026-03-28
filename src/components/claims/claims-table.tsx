'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { formatZAR, formatDate, truncate } from '@/lib/utils';
import { SlaBadge } from '@/components/ui/badge';
import { ClaimFilters } from './claim-filters';
import type { SlaPriority } from '@/types/claims';

interface ClaimRow {
  id: string;
  claimId: string;
  handler: string | null;
  insured: string | null;
  cause: string | null;
  claimStatus: string | null;
  secondaryStatus: string | null;
  isSlaBreach: boolean;
  daysInCurrentStatus: number | null;
  totalIncurred: number | null;
  totalOs: number | null;
  snapshotDate: string;
  slaPriority: SlaPriority | null;
  slaMaxDays: number | null;
}

interface ClaimsTableProps {
  initialData: ClaimRow[];
  initialTotal: number;
  initialPage: number;
  pageSize: number;
  snapshotDate: string | null;
  showHandlerFilter?: boolean;
}

const columnHelper = createColumnHelper<ClaimRow>();

function SlaBreachDot() {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#991B1B] opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#991B1B]" />
    </span>
  );
}

export function ClaimsTable({
  initialData,
  initialTotal,
  initialPage,
  pageSize,
  snapshotDate,
  showHandlerFilter = true,
}: ClaimsTableProps) {
  const router = useRouter();
  const [data, setData] = useState<ClaimRow[]>(initialData);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [handlerFilter, setHandlerFilter] = useState('');
  const [claimStatusFilter, setClaimStatusFilter] = useState('');
  const [slaBreachFilter, setSlaBreachFilter] = useState('');

  // Derived filter options from initial data
  const handlers = useMemo(() => {
    const set = new Set(initialData.map(r => r.handler).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [initialData]);

  const statuses = useMemo(() => {
    const set = new Set(initialData.map(r => r.claimStatus).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [initialData]);

  const fetchData = useCallback(async (p: number, sort: SortingState) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(pageSize),
      });
      if (snapshotDate) params.set('snapshotDate', snapshotDate);
      if (handlerFilter) params.set('handler', handlerFilter);
      if (claimStatusFilter) params.set('claimStatus', claimStatusFilter);
      if (slaBreachFilter) params.set('isSlaBreach', slaBreachFilter);
      if (sort.length > 0) {
        params.set('sortBy', sort[0].id);
        params.set('sortDir', sort[0].desc ? 'desc' : 'asc');
      }

      const res = await fetch(`/api/claims?${params}`);
      if (!res.ok) return;
      const json = await res.json() as { data: ClaimRow[]; total: number; page: number };
      setData(json.data);
      setTotal(json.total);
      setPage(json.page);
    } finally {
      setLoading(false);
    }
  }, [snapshotDate, handlerFilter, claimStatusFilter, slaBreachFilter, pageSize]);

  // Re-fetch when filters or sorting change
  useEffect(() => {
    fetchData(1, sorting);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlerFilter, claimStatusFilter, slaBreachFilter]);

  useEffect(() => {
    fetchData(page, sorting);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorting]);

  // Client-side search filter (by claimId or insured)
  const filteredData = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      r =>
        (r.claimId?.toLowerCase().includes(q)) ||
        (r.insured?.toLowerCase().includes(q))
    );
  }, [data, search]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = useMemo(() => [
    columnHelper.accessor('claimId', {
      header: 'Claim ID',
      cell: info => (
        <span className="font-mono text-[#0D2761] text-xs font-medium">
          {info.getValue() as string}
        </span>
      ),
    }),
    columnHelper.accessor('handler', {
      header: 'Handler',
      cell: info => <span className="text-sm text-[#0D2761]">{info.getValue() as string ?? '—'}</span>,
    }),
    columnHelper.accessor('insured', {
      header: 'Insured',
      cell: info => (
        <span className="text-sm text-[#0D2761]" title={info.getValue() as string ?? ''}>
          {truncate(info.getValue() as string | null, 30)}
        </span>
      ),
    }),
    columnHelper.accessor('cause', {
      header: 'Cause',
      cell: info => <span className="text-sm text-[#6B7280]">{(info.getValue() as string | null) ?? '—'}</span>,
    }),
    columnHelper.accessor('claimStatus', {
      header: 'Claim Status',
      cell: info => {
        const status = info.getValue() as string | null;
        const color =
          status === 'Finalised' ? 'text-[#065F46]' :
          status === 'Repudiated' || status === 'Cancelled' ? 'text-[#991B1B]' :
          'text-[#0D2761]';
        return <span className={`text-sm font-medium ${color}`}>{status ?? '—'}</span>;
      },
    }),
    columnHelper.accessor('secondaryStatus', {
      header: 'Secondary Status',
      cell: info => {
        const row = info.row.original;
        const status = info.getValue() as string | null;
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#0D2761]">{status ?? '—'}</span>
            {row.slaPriority && (
              <SlaBadge priority={row.slaPriority} />
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor('isSlaBreach', {
      header: 'SLA',
      cell: info => info.getValue() ? <SlaBreachDot /> : null,
      enableSorting: true,
    }),
    columnHelper.accessor('daysInCurrentStatus', {
      header: 'Days',
      cell: info => {
        const v = info.getValue() as number | null;
        return <span className="text-sm tabular-nums text-[#0D2761]">{v ?? '—'}</span>;
      },
    }),
    columnHelper.accessor('totalIncurred', {
      header: 'Total Incurred',
      cell: info => (
        <span className="text-sm tabular-nums text-right block">
          {formatZAR(info.getValue() as number | null)}
        </span>
      ),
    }),
    columnHelper.accessor('totalOs', {
      header: 'Outstanding',
      cell: info => (
        <span className="text-sm tabular-nums text-right block">
          {formatZAR(info.getValue() as number | null)}
        </span>
      ),
    }),
    columnHelper.accessor('snapshotDate', {
      header: 'Snapshot',
      cell: info => (
        <span className="text-xs text-[#6B7280]">
          {formatDate(info.getValue() as string)}
        </span>
      ),
    }),
  ], []);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: Math.ceil(total / pageSize),
  });

  const totalPages = Math.ceil(total / pageSize);

  // Export CSV
  function exportCsv() {
    const headers = ['Claim ID', 'Handler', 'Insured', 'Cause', 'Claim Status', 'Secondary Status', 'SLA Breach', 'Days', 'Total Incurred', 'Outstanding', 'Snapshot Date'];
    const rows = filteredData.map(r => [
      r.claimId,
      r.handler ?? '',
      r.insured ?? '',
      r.cause ?? '',
      r.claimStatus ?? '',
      r.secondaryStatus ?? '',
      r.isSlaBreach ? 'Yes' : 'No',
      r.daysInCurrentStatus ?? '',
      r.totalIncurred ?? '',
      r.totalOs ?? '',
      r.snapshotDate,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claims-${snapshotDate ?? 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleRowClick(claimId: string) {
    router.push(`/claims/${encodeURIComponent(claimId)}`);
  }

  function handleReset() {
    setSearch('');
    setHandlerFilter('');
    setClaimStatusFilter('');
    setSlaBreachFilter('');
  }

  return (
    <div>
      {/* Filter bar + Export */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <ClaimFilters
          search={search}
          handler={handlerFilter}
          claimStatus={claimStatusFilter}
          isSlaBreach={slaBreachFilter}
          handlers={showHandlerFilter ? handlers : []}
          statuses={statuses}
          onSearch={setSearch}
          onHandler={setHandlerFilter}
          onClaimStatus={setClaimStatusFilter}
          onSlaBreach={setSlaBreachFilter}
          onReset={handleReset}
        />
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#0D2761] bg-[#F5A800] rounded-lg hover:bg-[#e09d00] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
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
                        {header.column.getIsSorted() === 'asc' && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                          </svg>
                        )}
                        {header.column.getIsSorted() === 'desc' && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                          </svg>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-[#6B7280]">
                    Loading...
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-[#6B7280]">
                    No claims found.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map(row => (
                  <tr
                    key={row.id}
                    onClick={() => handleRowClick(row.original.claimId)}
                    className="border-b border-[#E8EEF8] last:border-0 hover:bg-[#F4F6FA] cursor-pointer transition-colors"
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#E8EEF8] bg-[#F4F6FA]">
          <p className="text-xs text-[#6B7280]">
            Showing{' '}
            <span className="font-medium text-[#0D2761]">
              {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)}
            </span>{' '}
            of <span className="font-medium text-[#0D2761]">{total}</span> claims
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { const p = page - 1; setPage(p); fetchData(p, sorting); }}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 text-xs font-medium text-[#6B7280] border border-[#E8EEF8] rounded-md hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-[#6B7280]">
              Page {page} of {totalPages || 1}
            </span>
            <button
              onClick={() => { const p = page + 1; setPage(p); fetchData(p, sorting); }}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 text-xs font-medium text-[#6B7280] border border-[#E8EEF8] rounded-md hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
