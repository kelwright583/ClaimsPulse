'use client';

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { SummaryHeader } from './SummaryHeader';
import { DrillDownFilters } from './DrillDownFilters';
import { ClaimsTable } from './ClaimsTable';
import { ClaimSidePanel } from './ClaimSidePanel';
import { ExportButton } from './ExportButton';
import type {
  DrillDownContext,
  DrillDownFilters as Filters,
  DrillDownResponse,
  DrillDownClaim,
} from './types';

const DEFAULT_SORT: Record<string, string> = {
  sla_breaches: 'daysInCurrentStatus',
  unacknowledged_flags: 'flaggedAt',
  parts_backorder: 'daysInCurrentStatus',
  big_claims: 'totalIncurred',
  unassigned_payment: 'totalPaid',
  status_changes: 'totalIncurred',
  value_jumps: 'totalIncurred',
  reopened: 'totalIncurred',
  newly_stale: 'daysInCurrentStatus',
  new_payments: 'grossPaid',
  finalised: 'totalPaid',
  handler: 'daysInCurrentStatus',
};

const DEFAULT_DIR: Record<string, 'asc' | 'desc'> = {
  unacknowledged_flags: 'asc',
};

interface Props {
  context: DrillDownContext;
  onClose: () => void;
}

export function DrillDownModal({ context, onClose }: Props) {
  const { type, title, handlerName } = context;

  const defaultSort = DEFAULT_SORT[type] ?? 'totalIncurred';
  const defaultDir: 'asc' | 'desc' = DEFAULT_DIR[type] ?? 'desc';

  const [filters, setFilters] = useState<Filters>(
    handlerName ? { handler: handlerName } : {}
  );
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(defaultSort);
  const [dir, setDir] = useState<'asc' | 'desc'>(defaultDir);
  const [data, setData] = useState<DrillDownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClaim, setSelectedClaim] = useState<DrillDownClaim | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ type, page: String(page), limit: '20', sort, dir });
    if (filters.handler) params.set('handler', filters.handler);
    if (filters.status) params.set('status', filters.status);
    if (filters.cause) params.set('cause', filters.cause);
    if (filters.area) params.set('area', filters.area);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);

    fetch(`/api/dashboard/drill-down?${params.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: DrillDownResponse | null) => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [type, page, sort, dir, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (selectedClaim) setSelectedClaim(null);
        else onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedClaim, onClose]);

  function handleFiltersChange(f: Filters) {
    setFilters(f);
    setPage(1);
  }

  function handleClearFilters() {
    setFilters(handlerName ? { handler: handlerName } : {});
    setPage(1);
  }

  function handleSort(key: string, d: 'asc' | 'desc') {
    setSort(key);
    setDir(d);
    setPage(1);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => { if (!selectedClaim) onClose(); }}
      />

      {/* Modal */}
      <div className="relative flex flex-col w-full bg-white m-4 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EEF8] bg-[#F4F6FA] flex-shrink-0">
          <h2 className="text-base font-bold text-[#0D2761]">{title}</h2>
          <div className="flex items-center gap-3">
            {data && (
              <ExportButton
                type={type}
                filters={filters}
                filteredCount={data.pagination.total}
                totalCount={data.summary.totalClaims}
              />
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[#E8EEF8] text-[#6B7280] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Summary header */}
        {data?.summary && (
          <div className="px-6 py-4 border-b border-[#E8EEF8] flex-shrink-0">
            <SummaryHeader type={type} summary={data.summary} />
          </div>
        )}

        {/* Filters */}
        <div className="px-6 border-b border-[#E8EEF8] flex-shrink-0">
          <DrillDownFilters
            filters={filters}
            onChange={handleFiltersChange}
            onClear={handleClearFilters}
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {data ? (
            <ClaimsTable
              type={type}
              claims={data.claims}
              total={data.pagination.total}
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              sort={sort}
              dir={dir}
              onPageChange={setPage}
              onSort={handleSort}
              onRowClick={setSelectedClaim}
              loading={loading}
            />
          ) : loading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse bg-[#E8EEF8] rounded h-8 w-full" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#9CA3AF] py-8 text-center">No data available</p>
          )}
        </div>
      </div>

      {/* Side panel */}
      {selectedClaim && (
        <ClaimSidePanel
          claim={selectedClaim}
          onClose={() => setSelectedClaim(null)}
        />
      )}
    </div>
  );
}
