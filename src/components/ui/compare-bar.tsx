'use client';

import { useState, useEffect } from 'react';
import { GitCompare, X, ChevronDown } from 'lucide-react';
import { useComparison } from '@/contexts/ComparisonContext';
import type { ComparisonMode } from '@/contexts/ComparisonContext';

interface AvailableDates {
  dates: string[];
  months: string[];
  years: number[];
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CompareBar() {
  const { isComparing, period, activate, deactivate, setPeriod, resolvedFromDate, resolvedToDate } = useComparison();
  const [available, setAvailable] = useState<AvailableDates | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isComparing || available) return;
    setLoading(true);
    fetch('/api/snapshots/available-dates')
      .then(r => r.json())
      .then((d: AvailableDates) => setAvailable(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isComparing, available]);

  const activeMode = period.mode ?? 'daily';
  const hasValidDates = resolvedFromDate && resolvedToDate;

  // Collapsed state (compare off)
  if (!isComparing) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-[#F4F6FA] border border-[#E8EEF8] rounded-lg mb-4 text-sm text-[#6B7280]">
        <GitCompare className="w-4 h-4 text-[#6B7280] flex-shrink-0" strokeWidth={2} />
        <span className="flex-1">Compare snapshots</span>
        <button
          onClick={() => activate('daily')}
          className="flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E8EEF8] rounded-md text-xs font-medium text-[#0D2761] hover:bg-[#EEF2FF] hover:border-[#1E5BC6] transition-colors"
        >
          Enable
          <ChevronDown className="w-3 h-3" strokeWidth={2} />
        </button>
      </div>
    );
  }

  // Expanded state (compare on)
  return (
    <div className="bg-[#EEF2FF] border border-[#1E5BC6]/30 rounded-xl mb-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1E5BC6]/20">
        <GitCompare className="w-4 h-4 text-[#1E5BC6] flex-shrink-0" strokeWidth={2} />
        <span className="text-sm font-semibold text-[#0D2761] flex-1">Compare mode active</span>
        {hasValidDates && (
          <span className="flex items-center gap-1 px-2.5 py-1 bg-[#D1FAE5] text-[#065F46] rounded-full text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] inline-block" />
            Comparing {formatDateLabel(resolvedFromDate!)} → {formatDateLabel(resolvedToDate!)}
          </span>
        )}
        <button
          onClick={deactivate}
          className="flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#0D2761] font-medium px-2 py-1 rounded hover:bg-white/60 transition-colors"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2} />
          Exit compare
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-0 border-b border-[#1E5BC6]/20">
        {(['daily', 'monthly', 'annual'] as ComparisonMode[]).map(mode => (
          <button
            key={mode!}
            onClick={() => activate(mode)}
            className={`px-4 py-2 text-xs font-semibold capitalize transition-colors ${
              activeMode === mode
                ? 'bg-white text-[#0D2761] border-b-2 border-[#1E5BC6]'
                : 'text-[#6B7280] hover:text-[#0D2761] hover:bg-white/40'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Date pickers */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-4">
        {activeMode === 'daily' && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-[#6B7280] w-24">Compare from</label>
              {loading ? (
                <div className="h-8 w-40 bg-white/60 rounded animate-pulse" />
              ) : (
                <select
                  value={period.fromDate ?? ''}
                  onChange={e => setPeriod({ fromDate: e.target.value || null })}
                  className="text-sm border border-[#E8EEF8] rounded-md px-2 py-1.5 bg-white text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6] min-w-[160px]"
                >
                  <option value="">— Select date —</option>
                  {(available?.dates ?? []).map(d => (
                    <option key={d} value={d}>{formatDateLabel(d)}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-[#6B7280] w-24">Compare to</label>
              {loading ? (
                <div className="h-8 w-40 bg-white/60 rounded animate-pulse" />
              ) : (
                <select
                  value={period.toDate ?? ''}
                  onChange={e => setPeriod({ toDate: e.target.value || null })}
                  className="text-sm border border-[#E8EEF8] rounded-md px-2 py-1.5 bg-white text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6] min-w-[160px]"
                >
                  <option value="">— Latest —</option>
                  {(available?.dates ?? []).map(d => (
                    <option key={d} value={d}>{formatDateLabel(d)}</option>
                  ))}
                </select>
              )}
            </div>
          </>
        )}

        {activeMode === 'monthly' && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-[#6B7280] w-24">From month</label>
              <input
                type="month"
                min="2025-10"
                value={period.fromMonth ?? ''}
                onChange={e => setPeriod({ fromMonth: e.target.value || null })}
                className="text-sm border border-[#E8EEF8] rounded-md px-2 py-1.5 bg-white text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-[#6B7280] w-24">To month</label>
              <input
                type="month"
                min="2025-10"
                value={period.toMonth ?? ''}
                onChange={e => setPeriod({ toMonth: e.target.value || null })}
                className="text-sm border border-[#E8EEF8] rounded-md px-2 py-1.5 bg-white text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
              />
            </div>
            <span className="text-xs text-[#6B7280]">Data available from Oct 2025</span>
          </>
        )}

        {activeMode === 'annual' && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-[#6B7280] w-24">From year</label>
              <select
                value={period.fromYear ?? ''}
                onChange={e => setPeriod({ fromYear: e.target.value ? parseInt(e.target.value, 10) : null })}
                className="text-sm border border-[#E8EEF8] rounded-md px-2 py-1.5 bg-white text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
              >
                <option value="">— Select year —</option>
                {(available?.years ?? []).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-[#6B7280] w-24">To year</label>
              <select
                value={period.toYear ?? ''}
                onChange={e => setPeriod({ toYear: e.target.value ? parseInt(e.target.value, 10) : null })}
                className="text-sm border border-[#E8EEF8] rounded-md px-2 py-1.5 bg-white text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
              >
                <option value="">— Select year —</option>
                {(available?.years ?? []).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {isComparing && !hasValidDates && (
          <span className="text-xs text-[#6B7280] italic">Select dates above to begin comparing</span>
        )}
      </div>

      {hasValidDates && (
        <div className="px-4 pb-3">
          <p className="text-xs text-[#4F46E5]">
            Compare mode is active. All dashboard cards will show changes between the selected periods.
          </p>
        </div>
      )}
    </div>
  );
}
