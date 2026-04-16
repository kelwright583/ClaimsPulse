'use client';

import { useEffect, useState } from 'react';
import type { DrillDownFilters } from './types';

interface FilterOptions {
  handlers: string[];
  causes: string[];
  areas: string[];
}

interface Props {
  filters: DrillDownFilters;
  onChange: (filters: DrillDownFilters) => void;
  onClear: () => void;
}

const STATUSES = ['Processing', 'Finalised', 'Cancelled', 'Repudiated', 'Re-opened'];

export function DrillDownFilters({ filters, onChange, onClear }: Props) {
  const [options, setOptions] = useState<FilterOptions>({ handlers: [], causes: [], areas: [] });

  useEffect(() => {
    fetch('/api/dashboard/drill-down/filter-options')
      .then(r => r.ok ? r.json() : null)
      .then((data: FilterOptions | null) => { if (data) setOptions(data); })
      .catch(() => {});
  }, []);

  function set(key: keyof DrillDownFilters, value: string) {
    onChange({ ...filters, [key]: value || undefined });
  }

  const hasFilters = Object.values(filters).some(v => v != null && v !== '');

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      {/* Date range */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-[#6B7280]">From</span>
        <input
          type="date"
          value={filters.from ?? ''}
          onChange={e => set('from', e.target.value)}
          className="text-xs border border-[#E8EEF8] rounded-lg px-2 py-1.5 text-[#0D2761] bg-white focus:outline-none focus:border-[#1E5BC6]"
        />
        <span className="text-xs text-[#6B7280]">to</span>
        <input
          type="date"
          value={filters.to ?? ''}
          onChange={e => set('to', e.target.value)}
          className="text-xs border border-[#E8EEF8] rounded-lg px-2 py-1.5 text-[#0D2761] bg-white focus:outline-none focus:border-[#1E5BC6]"
        />
      </div>

      {/* Handler */}
      <select
        value={filters.handler ?? ''}
        onChange={e => set('handler', e.target.value)}
        className="text-xs border border-[#E8EEF8] rounded-lg px-2 py-1.5 text-[#0D2761] bg-white focus:outline-none focus:border-[#1E5BC6]"
      >
        <option value="">All handlers</option>
        {options.handlers.map(h => <option key={h} value={h}>{h}</option>)}
      </select>

      {/* Status */}
      <select
        value={filters.status ?? ''}
        onChange={e => set('status', e.target.value)}
        className="text-xs border border-[#E8EEF8] rounded-lg px-2 py-1.5 text-[#0D2761] bg-white focus:outline-none focus:border-[#1E5BC6]"
      >
        <option value="">All statuses</option>
        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      {/* Cause */}
      <select
        value={filters.cause ?? ''}
        onChange={e => set('cause', e.target.value)}
        className="text-xs border border-[#E8EEF8] rounded-lg px-2 py-1.5 text-[#0D2761] bg-white focus:outline-none focus:border-[#1E5BC6]"
      >
        <option value="">All causes</option>
        {options.causes.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      {/* Area */}
      <select
        value={filters.area ?? ''}
        onChange={e => set('area', e.target.value)}
        className="text-xs border border-[#E8EEF8] rounded-lg px-2 py-1.5 text-[#0D2761] bg-white focus:outline-none focus:border-[#1E5BC6]"
      >
        <option value="">All areas</option>
        {options.areas.map(a => <option key={a} value={a}>{a}</option>)}
      </select>

      {hasFilters && (
        <button
          onClick={onClear}
          className="text-xs text-[#1E5BC6] hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
