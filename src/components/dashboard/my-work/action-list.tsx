'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle, RefreshCw, AlertOctagon } from 'lucide-react';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '@/components/dashboard/types';
import { useComparison } from '@/contexts/ComparisonContext';

interface MyWorkSubViewProps {
  role: UserRole;
  userId: string;
  filters: FilterState;
  handlerName: string;
  onHandlerChange: (name: string) => void;
}

interface ActionItem {
  claimId: string;
  secondaryStatus: string | null;
  insured: string | null;
  cause: string | null;
  totalIncurred: number | null;
  daysInStatus: number | null;
  priority: 'critical' | 'urgent' | 'standard';
  tatPosition: 'breach' | 'at-risk' | 'on-track';
  hasOverdueDelay: boolean;
  expectedDate: string | null;
  lastActionedDate: string | null;
  statusChanged: boolean;
  previousSecondaryStatus: string | null;
  isStuck?: boolean;
}

interface ActionListData {
  handlerName: string;
  totalClaims: number;
  items: ActionItem[];
  handlers: string[];
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

function lastActionedLabel(daysInStatus: number | null): string {
  if (daysInStatus === null) return '—';
  if (daysInStatus === 0) return 'Actioned today';
  if (daysInStatus === 1) return 'Last actioned yesterday';
  return `Last actioned ${daysInStatus} days ago`;
}

function ItemCard({ item, fromDate }: { item: ActionItem; fromDate?: string | null }) {
  const isCritical = item.priority === 'critical' && item.tatPosition === 'breach';
  const isUrgent = item.priority === 'urgent' || item.hasOverdueDelay;

  const borderColor = isCritical
    ? 'border-l-red-500'
    : isUrgent
    ? 'border-l-[#F5A800]'
    : 'border-l-[#1E5BC6]';

  const Icon = isCritical ? AlertCircle : isUrgent ? AlertTriangle : CheckCircle;
  const iconColor = isCritical
    ? 'text-red-500'
    : isUrgent
    ? 'text-[#F5A800]'
    : 'text-[#1E5BC6]';

  const lastActionedColor =
    item.daysInStatus === null ? 'text-[#6B7280]'
    : item.daysInStatus === 0 ? 'text-[#16A34A] font-medium'
    : item.daysInStatus <= 2 ? 'text-[#6B7280]'
    : item.daysInStatus <= 5 ? 'text-[#F5A800] font-medium'
    : 'text-red-500 font-medium';

  return (
    <div
      className={`bg-white border border-[#E8EEF8] rounded-lg p-3 mb-1.5 border-l-[3px] ${borderColor}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Row 1: claim ID + secondary status */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Icon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} strokeWidth={2} />
            <span className="text-[#0D2761] font-semibold text-sm">{item.claimId}</span>
            {item.secondaryStatus && (
              <>
                <span className="text-[#6B7280] text-sm">—</span>
                <span className="text-[#6B7280] text-sm">{item.secondaryStatus}</span>
              </>
            )}
            {item.statusChanged && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#EEF2FF] text-[#4F46E5] text-[10px] font-semibold rounded-full ml-1">
                <RefreshCw className="w-2.5 h-2.5" strokeWidth={2.5} />
                Status updated
              </span>
            )}
            {item.isStuck && fromDate && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#FEE2E2] text-[#991B1B] text-[10px] font-semibold rounded-full ml-1">
                <AlertOctagon className="w-2.5 h-2.5" strokeWidth={2.5} />
                Unchanged since {fromDate}
              </span>
            )}
          </div>
          {/* Row 2: cause + value */}
          <div className="mt-0.5 text-xs text-[#6B7280]">
            {item.cause ?? '—'} | {formatZAR(item.totalIncurred)}
          </div>
          {/* Row 3: last actioned + status change history */}
          <div className={`mt-0.5 text-xs ${lastActionedColor}`}>
            {lastActionedLabel(item.daysInStatus)}
            {item.statusChanged && item.previousSecondaryStatus && (
              <span className="text-[#6B7280] font-normal"> · was: {item.previousSecondaryStatus}</span>
            )}
          </div>
          {/* Overdue delay row */}
          {item.hasOverdueDelay && (
            <div className="mt-0.5 text-xs text-[#F5A800] font-medium">
              Expected: {item.expectedDate ?? '—'} | Overdue acknowledged delay
            </div>
          )}
        </div>
        {/* View link */}
        <Link
          href={`/claims/${item.claimId}`}
          className="flex-shrink-0 flex items-center gap-1 text-xs text-[#1E5BC6] hover:text-[#0D2761] font-medium whitespace-nowrap"
        >
          View claim
          <ArrowRight className="w-3 h-3" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}

function PrioritySection({
  label,
  items,
  fromDate,
}: {
  label: string;
  items: ActionItem[];
  fromDate?: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <h3 className="text-xs font-bold tracking-widest text-[#6B7280] uppercase mb-2">
        {label} ({items.length})
      </h3>
      {items.map((item) => (
        <ItemCard key={item.claimId} item={item} fromDate={fromDate} />
      ))}
    </div>
  );
}

export default function ActionList({
  role,
  filters: _filters,
  handlerName,
  onHandlerChange,
}: MyWorkSubViewProps) {
  const [data, setData] = useState<ActionListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isComparing, resolvedFromDate, resolvedToDate } = useComparison();

  const fetchData = useCallback(
    (signal: AbortSignal) => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ handler: handlerName });
      if (isComparing && resolvedFromDate) params.set('compareFrom', resolvedFromDate);
      if (isComparing && resolvedToDate) params.set('compareTo', resolvedToDate);
      fetch(`/api/dashboard/my-work/action-list?${params}`, { signal })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<ActionListData>;
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
    [handlerName, isComparing, resolvedFromDate, resolvedToDate],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  if (loading) {
    return <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />;
  }

  if (error || !data) {
    return (
      <div className="text-sm text-red-500 p-4">
        {error ?? 'No data available.'}
      </div>
    );
  }

  const critical = data.items.filter(
    (i) => i.priority === 'critical' && i.tatPosition === 'breach',
  );
  const urgent = data.items.filter(
    (i) => !(i.priority === 'critical' && i.tatPosition === 'breach') &&
      (i.priority === 'urgent' || i.hasOverdueDelay),
  );
  const standard = data.items.filter(
    (i) =>
      !(i.priority === 'critical' && i.tatPosition === 'breach') &&
      !(i.priority === 'urgent' || i.hasOverdueDelay),
  );

  // Comparison counts vs previous snapshot
  const stuckCount = data.items.filter(i => i.isStuck).length;

  const displayName =
    handlerName === '__all__' ? 'All handlers' : (data.handlerName || handlerName);

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-sm font-bold tracking-widest text-[#0D2761] uppercase">
          Today's priority list — {displayName} — {data.totalClaims} claims
        </h2>
        <HandlerSelector
          role={role}
          handlers={data.handlers}
          selected={handlerName}
          onHandlerChange={onHandlerChange}
        />
      </div>

      {/* Comparison banner */}
      {isComparing && resolvedFromDate && (
        <div className="flex items-center gap-3 flex-wrap mb-4 p-3 bg-[#EEF2FF] border border-[#1E5BC6]/30 rounded-xl">
          <span className="text-xs font-semibold text-[#4F46E5]">vs {resolvedFromDate}</span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#991B1B]">
            Critical {critical.length}
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#92400E]">
            Urgent {urgent.length}
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#E8EEF8] text-[#0D2761]">
            Standard {standard.length}
          </span>
          {stuckCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#7F1D1D]">
              ⚠ {stuckCount} stuck
            </span>
          )}
        </div>
      )}

      {data.items.length === 0 ? (
        <p className="text-sm text-[#6B7280] py-6 text-center">
          All clear — no priority actions today.
        </p>
      ) : (
        <>
          <PrioritySection label="Critical action" items={critical} fromDate={resolvedFromDate} />
          <PrioritySection label="Urgent action" items={urgent} fromDate={resolvedFromDate} />
          <PrioritySection label="Standard" items={standard} fromDate={resolvedFromDate} />
        </>
      )}
    </div>
  );
}
