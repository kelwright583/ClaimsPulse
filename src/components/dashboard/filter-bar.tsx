'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { FilterState } from './types';
import { getFyBoundaries } from '@/lib/fiscal';

interface FilterBarProps {
  filters: FilterState;
  activeFilters: (keyof FilterState)[];
  onChange: (key: keyof FilterState, value: string) => void;
  onClear: () => void;
}

const DATE_RANGE_OPTIONS = [
  { value: 'this-month',    label: 'This month' },
  { value: 'last-month',    label: 'Last month' },
  { value: 'last-3-months', label: 'Last 3 months' },
  { value: 'ytd',           label: 'Year to date' },
];

const PERIOD_OPTIONS = [
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'ytd',       label: 'YTD' },
];

const NET_GROSS_OPTIONS = [
  { value: 'net',   label: 'Net' },
  { value: 'gross', label: 'Gross' },
];

const SLA_POSITION_OPTIONS = [
  { value: '',         label: 'All positions' },
  { value: 'on-track', label: 'On track' },
  { value: 'at-risk',  label: 'At risk' },
  { value: 'breach',   label: 'Breached' },
];

const ACTION_TYPE_OPTIONS = [
  { value: '',                label: 'All actions' },
  { value: 'write_off',       label: 'Write-offs' },
  { value: 'tp_instructed',   label: 'TP recovery' },
  { value: 'salvage_referred',label: 'Salvage' },
  { value: 'repairer_chased', label: 'Repairer invoice' },
];

const DATE_WINDOW_OPTIONS = [
  { value: 'fy_ytd',   label: 'FY YTD' },
  { value: 'mtd',      label: 'Month to date' },
  { value: 'last_12m', label: 'Last 12 months' },
  { value: 'custom',   label: 'Custom range' },
];

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-[#6B7280] font-medium">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-[12px] text-[#0D2761] font-medium bg-white border border-[#E8EEF8] rounded-md px-2 py-1 pr-6 appearance-none cursor-pointer hover:border-[#1E5BC6] transition-colors focus:outline-none focus:border-[#1E5BC6]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 6px center',
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function TextFilter({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-[#6B7280] font-medium">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="text-[12px] text-[#0D2761] font-medium bg-white border border-[#E8EEF8] rounded-md px-2 py-1 w-36 hover:border-[#1E5BC6] transition-colors focus:outline-none focus:border-[#1E5BC6] placeholder:text-[#6B7280]"
      />
    </div>
  );
}

/**
 * GlobalFilterBar manages the "new" FY-aware filter controls:
 * - Date Window (win param)
 * - Product Lines multi-select (pl param, comma-separated)
 * - UW Year (uw param)
 *
 * These are serialised as ?win=fy_ytd&pl=Fintech,Taxi&uw=2026 and are
 * independent of the existing dashboard-client URL param loop.
 */
function GlobalFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentUwYear = getFyBoundaries().uwYear;
  const uwYearOptions = [currentUwYear - 1, currentUwYear, currentUwYear + 1];

  // Read from URL
  const win = (searchParams.get('win') ?? 'fy_ytd') as FilterState['dateWindow'];
  const pl = searchParams.get('pl') ?? '';
  const uw = parseInt(searchParams.get('uw') ?? String(currentUwYear), 10);
  const customStart = searchParams.get('cs') ?? '';
  const customEnd = searchParams.get('ce') ?? '';

  const selectedProductLines: string[] = pl ? pl.split(',').filter(Boolean) : [];

  // Fetch product line options
  const [productLineOptions, setProductLineOptions] = useState<{ rawValue: string; displayName: string }[]>([]);
  useEffect(() => {
    fetch('/api/reference/product-lines')
      .then(r => r.ok ? r.json() : [])
      .then((data: { rawValue: string; displayName: string }[]) => {
        if (Array.isArray(data)) setProductLineOptions(data);
      })
      .catch(() => {});
  }, []);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const p = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          p.delete(key);
        } else {
          p.set(key, value);
        }
      }
      router.replace(`${pathname}?${p.toString()}`);
    },
    [router, pathname, searchParams],
  );

  function handleWinChange(value: string) {
    const updates: Record<string, string | null> = { win: value };
    if (value !== 'custom') {
      updates['cs'] = null;
      updates['ce'] = null;
    }
    updateParams(updates);
  }

  function handleUwChange(value: string) {
    updateParams({ uw: value });
  }

  function toggleProductLine(rawValue: string) {
    const current = new Set(selectedProductLines);
    if (current.has(rawValue)) {
      current.delete(rawValue);
    } else {
      current.add(rawValue);
    }
    const newPl = Array.from(current).join(',');
    updateParams({ pl: newPl || null });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap py-1 border-t border-[#E8EEF8] mt-2 pt-2">
      {/* Date Window */}
      <FilterSelect
        label="Window"
        value={win}
        options={DATE_WINDOW_OPTIONS}
        onChange={handleWinChange}
      />

      {/* Custom date pickers — only shown when win === 'custom' */}
      {win === 'custom' && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#6B7280] font-medium">From</span>
            <input
              type="date"
              value={customStart}
              onChange={e => updateParams({ cs: e.target.value || null })}
              className="text-[12px] text-[#0D2761] font-medium bg-white border border-[#E8EEF8] rounded-md px-2 py-1 focus:outline-none focus:border-[#1E5BC6]"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#6B7280] font-medium">To</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => updateParams({ ce: e.target.value || null })}
              className="text-[12px] text-[#0D2761] font-medium bg-white border border-[#E8EEF8] rounded-md px-2 py-1 focus:outline-none focus:border-[#1E5BC6]"
            />
          </div>
        </>
      )}

      {/* Product Lines multi-select */}
      {productLineOptions.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[#6B7280] font-medium">Product</span>
          <div className="flex gap-1 flex-wrap">
            {productLineOptions.map(opt => {
              const isSelected = selectedProductLines.includes(opt.rawValue);
              return (
                <button
                  key={opt.rawValue}
                  onClick={() => toggleProductLine(opt.rawValue)}
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                    isSelected
                      ? 'bg-[#1E5BC6] text-white border-[#1E5BC6]'
                      : 'bg-white text-[#0D2761] border-[#E8EEF8] hover:border-[#1E5BC6]'
                  }`}
                >
                  {opt.displayName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* UW Year */}
      <FilterSelect
        label="UW Year"
        value={String(uw)}
        options={uwYearOptions.map(y => ({
          value: String(y),
          label: y === currentUwYear ? `${y} (current)` : String(y),
        }))}
        onChange={handleUwChange}
      />
    </div>
  );
}

export function FilterBar({ filters, activeFilters, onChange, onClear }: FilterBarProps) {
  if (activeFilters.length === 0) return null;

  const isDirty = activeFilters.some(k => {
    if (k === 'dateRange') return filters.dateRange !== 'this-month';
    if (k === 'netGross') return filters.netGross !== 'net';
    if (k === 'period') return filters.period !== 'monthly';
    return filters[k] !== '';
  });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3 flex-wrap py-2">
        {activeFilters.includes('dateRange') && (
          <FilterSelect
            label="Period"
            value={filters.dateRange}
            options={DATE_RANGE_OPTIONS}
            onChange={v => onChange('dateRange', v)}
          />
        )}
        {activeFilters.includes('period') && (
          <FilterSelect
            label="View"
            value={filters.period}
            options={PERIOD_OPTIONS}
            onChange={v => onChange('period', v)}
          />
        )}
        {activeFilters.includes('netGross') && (
          <FilterSelect
            label="Basis"
            value={filters.netGross}
            options={NET_GROSS_OPTIONS}
            onChange={v => onChange('netGross', v)}
          />
        )}
        {activeFilters.includes('productLine') && (
          <TextFilter
            label="Product"
            value={filters.productLine}
            placeholder="All products"
            onChange={v => onChange('productLine', v)}
          />
        )}
        {activeFilters.includes('handler') && (
          <TextFilter
            label="Handler"
            value={filters.handler}
            placeholder="All handlers"
            onChange={v => onChange('handler', v)}
          />
        )}
        {activeFilters.includes('broker') && (
          <TextFilter
            label="Broker"
            value={filters.broker}
            placeholder="All brokers"
            onChange={v => onChange('broker', v)}
          />
        )}
        {activeFilters.includes('cause') && (
          <TextFilter
            label="Cause"
            value={filters.cause}
            placeholder="All causes"
            onChange={v => onChange('cause', v)}
          />
        )}
        {activeFilters.includes('status') && (
          <TextFilter
            label="Status"
            value={filters.status}
            placeholder="All statuses"
            onChange={v => onChange('status', v)}
          />
        )}
        {activeFilters.includes('area') && (
          <TextFilter
            label="Area"
            value={filters.area}
            placeholder="All areas"
            onChange={v => onChange('area', v)}
          />
        )}
        {activeFilters.includes('tatPosition') && (
          <FilterSelect
            label="TAT Position"
            value={filters.tatPosition}
            options={SLA_POSITION_OPTIONS}
            onChange={v => onChange('tatPosition', v)}
          />
        )}
        {activeFilters.includes('actionType') && (
          <FilterSelect
            label="Action"
            value={filters.actionType}
            options={ACTION_TYPE_OPTIONS}
            onChange={v => onChange('actionType', v)}
          />
        )}
        {activeFilters.includes('uwYear') && (
          <FilterSelect
            label="UW year"
            value={filters.uwYear}
            options={[
              { value: '', label: 'Current year' },
              { value: '2025', label: '2025' },
              { value: '2026', label: '2026' },
            ]}
            onChange={v => onChange('uwYear', v)}
          />
        )}
        {isDirty && (
          <button
            onClick={onClear}
            className="text-[11px] text-[#1E5BC6] hover:text-[#0D2761] font-medium transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* New global FY-aware filter bar */}
      <GlobalFilterBar />
    </div>
  );
}
