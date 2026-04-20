'use client';

import type { FilterState } from './types';

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

export function FilterBar({ filters, activeFilters, onChange, onClear }: FilterBarProps) {
  if (activeFilters.length === 0) return null;

  const isDirty = activeFilters.some(k => {
    if (k === 'dateRange') return filters.dateRange !== 'this-month';
    if (k === 'netGross') return filters.netGross !== 'net';
    if (k === 'period') return filters.period !== 'monthly';
    return filters[k] !== '';
  });

  return (
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
  );
}
