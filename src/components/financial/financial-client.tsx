'use client';

import { useState, useEffect } from 'react';
import { StatCard } from '@/components/ui/stat-card';
import { formatZAR, formatDate } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FinancialSummary {
  totalGwp: number;
  totalNetWp: number;
  totalIncurred: number;
  totalOs: number;
  lossRatio: number | null;
  uwResultNet: number;
  uwResultGross: number;
  ibnrOpen: number;
  ibnrClose: number;
  ibnrMovement: number;
  hasMovementData: boolean;
  hasPremiumData: boolean;
}

interface PeriodRow {
  period: string;
  periodDate: string;
  totalGwp: number;
  totalNetWp: number;
  totalNetComm: number;
  incurred: number;
  lossRatio: number | null;
}

interface BrokerRow {
  broker: string;
  gwp: number;
  netWp: number;
  netComm: number;
  incurred: number;
  lossRatio: number | null;
  commPct: number | null;
}

interface ClassRow {
  className: string;
  gwp: number;
  netWp: number;
}

interface FinancialData {
  summary: FinancialSummary;
  periods: PeriodRow[];
  brokerPerformance: BrokerRow[];
  classBreakdown: ClassRow[];
  snapshotDate: string | null;
}

// ---------------------------------------------------------------------------
// Loss ratio helpers
// ---------------------------------------------------------------------------

interface LrStyle {
  text: string;
  bg: string;
  label: string;
}

function lrStyle(lr: number | null): LrStyle {
  if (lr === null) return { text: '#6B7280', bg: '#F4F6FA', label: '—' };
  if (lr < 65) return { text: '#065F46', bg: '#D1FAE5', label: `${lr.toFixed(1)}%` };
  if (lr <= 80) return { text: '#92400E', bg: '#FEF3C7', label: `${lr.toFixed(1)}%` };
  return { text: '#991B1B', bg: '#FEE2E2', label: `${lr.toFixed(1)}%` };
}

function LossRatioBadge({ lr, size = 'sm' }: { lr: number | null; size?: 'sm' | 'lg' }) {
  const s = lrStyle(lr);
  const padding = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold tabular-nums ${padding}`}
      style={{ color: s.text, backgroundColor: s.bg }}
    >
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// UW Result display
// ---------------------------------------------------------------------------

function UwResult({ value }: { value: number }) {
  const isPositive = value >= 0;
  const color = isPositive ? '#065F46' : '#991B1B';
  const sign = isPositive ? '+' : '';
  return (
    <span className="tabular-nums font-semibold" style={{ color }}>
      {sign}{formatZAR(value, 0)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sort chevron icon
// ---------------------------------------------------------------------------

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) {
    return (
      <svg className="w-3 h-3 text-[#D3D1C7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      </svg>
    );
  }
  return (
    <svg className="w-3 h-3 text-[#0D2761]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      {dir === 'asc' ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#E8EEF8' }}>
        <svg className="w-6 h-6" style={{ color: '#0D2761' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      </div>
      <p className="text-sm font-medium" style={{ color: '#0D2761' }}>No data available</p>
      <p className="text-xs mt-1" style={{ color: '#6B7280' }}>{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: '#6B7280' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Periods table
// ---------------------------------------------------------------------------

type PeriodSortKey = 'period' | 'totalGwp' | 'totalNetWp' | 'incurred' | 'lossRatio';

function PeriodsTable({ periods }: { periods: PeriodRow[] }) {
  const [sortKey, setSortKey] = useState<PeriodSortKey>('period');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(key: PeriodSortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  const sorted = [...periods].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === 'string' && typeof bv === 'string')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc'
      ? (av as number) - (bv as number)
      : (bv as number) - (av as number);
  });

  const cols: { key: PeriodSortKey; label: string; align: string }[] = [
    { key: 'period', label: 'Period', align: 'text-left' },
    { key: 'totalGwp', label: 'GWP', align: 'text-right' },
    { key: 'totalNetWp', label: 'Net WP', align: 'text-right' },
    { key: 'incurred', label: 'Incurred', align: 'text-right' },
    { key: 'lossRatio', label: 'Loss Ratio', align: 'text-right' },
  ];

  return (
    <div className="bg-white border rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]" style={{ borderColor: '#E8EEF8' }}>
      {periods.length === 0 ? (
        <EmptyState message="Upload revenue and movement reports to see financial data" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ backgroundColor: '#F4F6FA', borderColor: '#E8EEF8' }}>
                {cols.map(c => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none ${c.align}`}
                    style={{ color: '#F5A800' }}
                  >
                    <span className={`inline-flex items-center gap-1 ${c.align === 'text-right' ? 'justify-end w-full' : ''}`}>
                      {c.label}
                      <SortIcon active={sortKey === c.key} dir={sortDir} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, idx) => (
                <tr
                  key={row.period}
                  className="border-b last:border-0"
                  style={{
                    borderColor: '#E8EEF8',
                    backgroundColor: idx % 2 === 1 ? '#F4F6FA' : 'white',
                  }}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: '#0D2761' }}>
                    {row.period}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-right" style={{ color: '#0D2761' }}>
                    {formatZAR(row.totalGwp, 0)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-right" style={{ color: '#0D2761' }}>
                    {formatZAR(row.totalNetWp, 0)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-right" style={{ color: '#0D2761' }}>
                    {formatZAR(row.incurred, 0)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <LossRatioBadge lr={row.lossRatio} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Broker performance table
// ---------------------------------------------------------------------------

type BrokerSortKey = 'broker' | 'gwp' | 'netWp' | 'incurred' | 'lossRatio' | 'commPct';

function BrokerTable({ brokers }: { brokers: BrokerRow[] }) {
  const [sortKey, setSortKey] = useState<BrokerSortKey>('gwp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(key: BrokerSortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  const sorted = [...brokers].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === 'string' && typeof bv === 'string')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc'
      ? (av as number) - (bv as number)
      : (bv as number) - (av as number);
  });

  const cols: { key: BrokerSortKey; label: string; align: string }[] = [
    { key: 'broker', label: 'Broker', align: 'text-left' },
    { key: 'gwp', label: 'GWP', align: 'text-right' },
    { key: 'netWp', label: 'Net WP', align: 'text-right' },
    { key: 'incurred', label: 'Incurred', align: 'text-right' },
    { key: 'lossRatio', label: 'Loss Ratio', align: 'text-right' },
    { key: 'commPct', label: 'Comm %', align: 'text-right' },
  ];

  return (
    <div className="bg-white border rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]" style={{ borderColor: '#E8EEF8' }}>
      {brokers.length === 0 ? (
        <EmptyState message="Upload revenue and movement reports to see financial data" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ backgroundColor: '#F4F6FA', borderColor: '#E8EEF8' }}>
                {cols.map(c => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none ${c.align}`}
                    style={{ color: '#F5A800' }}
                  >
                    <span className={`inline-flex items-center gap-1 ${c.align === 'text-right' ? 'justify-end w-full' : ''}`}>
                      {c.label}
                      <SortIcon active={sortKey === c.key} dir={sortDir} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, idx) => (
                <tr
                  key={row.broker}
                  className="border-b last:border-0"
                  style={{
                    borderColor: '#E8EEF8',
                    backgroundColor: idx % 2 === 1 ? '#F4F6FA' : 'white',
                  }}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: '#0D2761' }}>
                    {row.broker}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-right" style={{ color: '#0D2761' }}>
                    {formatZAR(row.gwp, 0)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-right" style={{ color: '#0D2761' }}>
                    {formatZAR(row.netWp, 0)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-right" style={{ color: '#0D2761' }}>
                    {formatZAR(row.incurred, 0)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <LossRatioBadge lr={row.lossRatio} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-right" style={{ color: '#6B7280' }}>
                    {row.commPct !== null ? `${row.commPct.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Class breakdown table
// ---------------------------------------------------------------------------

function ClassTable({ classes, totalGwp }: { classes: ClassRow[]; totalGwp: number }) {
  return (
    <div className="bg-white border rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]" style={{ borderColor: '#E8EEF8' }}>
      {classes.length === 0 ? (
        <EmptyState message="Upload revenue and movement reports to see financial data" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ backgroundColor: '#F4F6FA', borderColor: '#E8EEF8' }}>
                {['Class', 'GWP', 'Net WP', '% of Total GWP'].map(h => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${h === 'Class' ? 'text-left' : 'text-right'}`}
                    style={{ color: '#F5A800' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classes.map((row, idx) => {
                const pct = totalGwp > 0 ? (row.gwp / totalGwp) * 100 : 0;
                return (
                  <tr
                    key={row.className}
                    className="border-b last:border-0"
                    style={{
                      borderColor: '#E8EEF8',
                      backgroundColor: idx % 2 === 1 ? '#F4F6FA' : 'white',
                    }}
                  >
                    <td className="px-4 py-3 font-medium" style={{ color: '#0D2761' }}>
                      {row.className}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-right" style={{ color: '#0D2761' }}>
                      {formatZAR(row.gwp, 0)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-right" style={{ color: '#0D2761' }}>
                      {formatZAR(row.netWp, 0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${Math.max(pct, 2)}px`,
                            maxWidth: '80px',
                            minWidth: '4px',
                            backgroundColor: '#F5A800',
                            opacity: 0.7,
                          }}
                        />
                        <span className="tabular-nums text-xs font-medium w-12 text-right" style={{ color: '#6B7280' }}>
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IBNR card
// ---------------------------------------------------------------------------

function IbnrCard({ summary }: { summary: FinancialSummary }) {
  const movementPositive = summary.ibnrMovement >= 0;
  const movementColor = movementPositive ? '#065F46' : '#991B1B';
  const movementBg = movementPositive ? '#D1FAE5' : '#FEE2E2';
  const movementSign = movementPositive ? '+' : '';

  return (
    <div className="bg-white border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06)]" style={{ borderColor: '#E8EEF8' }}>
      <div className="px-5 py-4 border-b" style={{ borderColor: '#E8EEF8', backgroundColor: '#F4F6FA' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6B7280' }}>
          IBNR Movement
        </h3>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-3 gap-4">
          {/* Opening */}
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: '#6B7280' }}>Opening</p>
            <p className="text-xl font-semibold tabular-nums" style={{ color: '#0D2761' }}>
              {formatZAR(summary.ibnrOpen, 0)}
            </p>
          </div>

          {/* Arrow + movement */}
          <div className="flex flex-col items-center justify-center">
            <div
              className="px-3 py-1 rounded-full text-sm font-semibold tabular-nums mb-1"
              style={{ color: movementColor, backgroundColor: movementBg }}
            >
              {movementSign}{formatZAR(summary.ibnrMovement, 0)}
            </div>
            <svg className="w-5 h-5" style={{ color: '#6B7280' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </div>

          {/* Closing */}
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: '#6B7280' }}>Closing</p>
            <p className="text-xl font-semibold tabular-nums" style={{ color: '#0D2761' }}>
              {formatZAR(summary.ibnrClose, 0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenario Modeller
// ---------------------------------------------------------------------------

const CAUSE_TYPES = ['Glass', 'Complex', 'Theft'] as const;
type CauseType = (typeof CAUSE_TYPES)[number];

function ScenarioModeller({ totalIncurred, totalNetWp }: { totalIncurred: number; totalNetWp: number }) {
  const [additionalClaims, setAdditionalClaims] = useState(0);
  const [avgClaimValue, setAvgClaimValue] = useState(0);
  const [causeType, setCauseType] = useState<CauseType>('Glass');

  const projectedNewIncurred = additionalClaims * avgClaimValue;
  const projectedTotalIncurred = totalIncurred + projectedNewIncurred;
  const projectedLossRatio = totalNetWp > 0 ? (projectedTotalIncurred / totalNetWp) * 100 : null;

  const impactStyle = lrStyle(projectedLossRatio);

  function reset() {
    setAdditionalClaims(0);
    setAvgClaimValue(0);
    setCauseType('Glass');
  }

  const hasImpact = projectedNewIncurred > 0;

  return (
    <div
      className="bg-white border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06)] border-l-4"
      style={{ borderColor: '#E8EEF8', borderLeftColor: '#F5A800' }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 border-b flex items-center justify-between"
        style={{ borderColor: '#E8EEF8', backgroundColor: '#F4F6FA' }}
      >
        <div>
          <h3 className="text-sm font-semibold" style={{ color: '#0D2761' }}>
            Scenario Modeller
          </h3>
          <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>
            Model the impact of additional claims on your loss ratio.
          </p>
        </div>
        <button
          onClick={reset}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-[#F4F6FA]"
          style={{ borderColor: '#E8EEF8', color: '#6B7280' }}
        >
          Reset
        </button>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Additional Claims */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#6B7280' }}>
              Additional Claims
            </label>
            <input
              type="number"
              min={0}
              max={500}
              step={1}
              value={additionalClaims}
              onChange={e => setAdditionalClaims(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-3 py-2.5 border rounded-lg text-sm tabular-nums focus:outline-none"
              style={{ borderColor: '#E8EEF8', color: '#0D2761' }}
            />
            <div className="mt-2">
              <input
                type="range"
                min={0}
                max={500}
                step={1}
                value={additionalClaims}
                onChange={e => setAdditionalClaims(parseInt(e.target.value))}
                className="w-full accent-[#F5A800]"
              />
              <div className="flex justify-between text-xs mt-0.5" style={{ color: '#6B7280' }}>
                <span>0</span><span>500</span>
              </div>
            </div>
          </div>

          {/* Avg Claim Value */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#6B7280' }}>
              Avg Claim Value (ZAR)
            </label>
            <div className="relative">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium select-none"
                style={{ color: '#6B7280' }}
              >
                R
              </span>
              <input
                type="number"
                min={0}
                max={500000}
                step={1000}
                value={avgClaimValue}
                onChange={e => setAvgClaimValue(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full pl-7 pr-3 py-2.5 border rounded-lg text-sm tabular-nums focus:outline-none"
                style={{ borderColor: '#E8EEF8', color: '#0D2761' }}
              />
            </div>
            <div className="mt-2">
              <input
                type="range"
                min={0}
                max={500000}
                step={1000}
                value={avgClaimValue}
                onChange={e => setAvgClaimValue(parseInt(e.target.value))}
                className="w-full accent-[#F5A800]"
              />
              <div className="flex justify-between text-xs mt-0.5" style={{ color: '#6B7280' }}>
                <span>R0</span><span>R500k</span>
              </div>
            </div>
          </div>

          {/* Cause Type */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#6B7280' }}>
              Cause Type
            </label>
            <select
              value={causeType}
              onChange={e => setCauseType(e.target.value as CauseType)}
              className="w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none"
              style={{ borderColor: '#E8EEF8', color: '#0D2761', backgroundColor: 'white' }}
            >
              {CAUSE_TYPES.map(ct => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: '#6B7280' }}>
              Cause type is informational — affects how you label the scenario.
            </p>
          </div>
        </div>

        {/* Impact output */}
        <div
          className="mt-5 rounded-xl p-4 border"
          style={{
            backgroundColor: hasImpact ? impactStyle.bg : '#F4F6FA',
            borderColor: hasImpact ? '#E8EEF8' : '#E8EEF8',
          }}
        >
          {!hasImpact ? (
            <p className="text-sm text-center" style={{ color: '#6B7280' }}>
              Adjust the sliders above to model a scenario.
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#6B7280' }}>
                  Impact ({causeType})
                </p>
                <p className="text-sm font-semibold" style={{ color: '#0D2761' }}>
                  +{formatZAR(projectedNewIncurred, 0)} additional incurred
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>
                  {additionalClaims} claims × {formatZAR(avgClaimValue, 0)} avg
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#6B7280' }}>
                  Projected Loss Ratio
                </p>
                {projectedLossRatio !== null ? (
                  <>
                    <span
                      className="inline-flex items-center px-3 py-1 rounded-full text-lg font-bold tabular-nums"
                      style={{ color: impactStyle.text, backgroundColor: impactStyle.bg }}
                    >
                      {projectedLossRatio.toFixed(1)}%
                    </span>
                    <p className="text-xs mt-1" style={{ color: impactStyle.text }}>
                      {projectedLossRatio < 65
                        ? 'Healthy — below 65%'
                        : projectedLossRatio <= 80
                        ? 'Watch — 65–80%'
                        : 'Alert — above 80%'}
                    </p>
                  </>
                ) : (
                  <span className="text-sm" style={{ color: '#6B7280' }}>No NWP data</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FinancialClient() {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/financial')
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch');
        return r.json();
      })
      .then((d: FinancialData) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // ---- Loading ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 animate-spin" style={{ color: '#F5A800' }} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm" style={{ color: '#6B7280' }}>Loading financial data…</p>
        </div>
      </div>
    );
  }

  // ---- Error ----
  if (error || !data) {
    return (
      <div className="bg-white border rounded-xl p-8 text-center" style={{ borderColor: '#E8EEF8' }}>
        <p className="text-sm" style={{ color: '#6B7280' }}>Failed to load financial data.</p>
      </div>
    );
  }

  const { summary, periods, brokerPerformance, classBreakdown, snapshotDate } = data;

  // Determine overall state: if no data at all, show a top-level empty state
  const hasAnyData =
    summary.hasPremiumData ||
    summary.hasMovementData ||
    periods.length > 0 ||
    brokerPerformance.length > 0 ||
    classBreakdown.length > 0;

  // UW result variant for stat card
  const uwNetVariant: 'success' | 'danger' = summary.uwResultNet >= 0 ? 'success' : 'danger';
  const uwGrossVariant: 'success' | 'danger' = summary.uwResultGross >= 0 ? 'success' : 'danger';

  const lrS = lrStyle(summary.lossRatio);
  const lrVariant =
    summary.lossRatio === null
      ? 'default'
      : summary.lossRatio < 65
      ? 'success'
      : summary.lossRatio <= 80
      ? 'warning'
      : 'danger';

  // UW result display values (with sign)
  const uwNetDisplay =
    summary.uwResultNet === 0
      ? formatZAR(0, 0)
      : `${summary.uwResultNet > 0 ? '+' : ''}${formatZAR(summary.uwResultNet, 0)}`;
  const uwGrossDisplay =
    summary.uwResultGross === 0
      ? formatZAR(0, 0)
      : `${summary.uwResultGross > 0 ? '+' : ''}${formatZAR(summary.uwResultGross, 0)}`;

  return (
    <div style={{ color: '#0D2761' }}>
      {/* ---- Header ---- */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: '#0D2761' }}>
          Financial Overview
        </h1>
        {snapshotDate ? (
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>
            Snapshot: {formatDate(snapshotDate)}
          </p>
        ) : (
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>
            No snapshot date available
          </p>
        )}
      </div>

      {/* ---- No data state ---- */}
      {!hasAnyData ? (
        <div
          className="bg-white border rounded-xl p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
          style={{ borderColor: '#E8EEF8' }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: '#E8EEF8' }}
          >
            <svg className="w-7 h-7" style={{ color: '#0D2761' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
            </svg>
          </div>
          <p className="text-base font-semibold mb-1" style={{ color: '#0D2761' }}>
            No financial data available
          </p>
          <p className="text-sm" style={{ color: '#6B7280' }}>
            Upload revenue and movement reports to see financial data
          </p>
        </div>
      ) : (
        <div className="space-y-8">

          {/* ---- Summary stat cards ---- */}
          <Section title="Portfolio Summary">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <StatCard
                label="Gross WP"
                value={formatZAR(summary.totalGwp, 0)}
                sub="Gross written premium"
              />
              <StatCard
                label="Net WP"
                value={formatZAR(summary.totalNetWp, 0)}
                sub="Net of reinsurance"
              />
              <StatCard
                label="Total Incurred"
                value={formatZAR(summary.totalIncurred, 0)}
                sub="Claims incurred"
                variant={summary.totalIncurred > summary.totalNetWp ? 'danger' : 'default'}
              />
              <StatCard
                label="Outstanding Reserves"
                value={formatZAR(summary.totalOs, 0)}
                sub="Total open reserves"
              />
              <div
                className="bg-white border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5 border-l-4"
                style={{
                  borderLeftColor:
                    lrVariant === 'success'
                      ? '#0F6E56'
                      : lrVariant === 'warning'
                      ? '#854F0B'
                      : lrVariant === 'danger'
                      ? '#A32D2D'
                      : '#1B3A5C',
                  borderColor: '#D3D1C7',
                }}
              >
                <p className="text-xs font-medium text-[#5F5E5A] uppercase tracking-wide mb-2">Loss Ratio</p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="text-2xl font-semibold tabular-nums px-2.5 py-0.5 rounded-full"
                    style={{ color: lrS.text, backgroundColor: lrS.bg }}
                  >
                    {summary.lossRatio !== null ? `${summary.lossRatio.toFixed(1)}%` : '—'}
                  </span>
                </div>
                <p className="text-xs text-[#5F5E5A] mt-2">
                  {summary.lossRatio === null
                    ? 'No data'
                    : summary.lossRatio < 65
                    ? 'Healthy — below 65%'
                    : summary.lossRatio <= 80
                    ? 'Watch — 65–80%'
                    : 'Alert — above 80%'}
                </p>
              </div>
              <div
                className="bg-white border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5 border-l-4"
                style={{
                  borderLeftColor: summary.uwResultNet >= 0 ? '#0F6E56' : '#A32D2D',
                  borderColor: '#D3D1C7',
                }}
              >
                <p className="text-xs font-medium text-[#5F5E5A] uppercase tracking-wide mb-2">UW Result (Net)</p>
                <p className={`text-2xl font-semibold tabular-nums`}>
                  <UwResult value={summary.uwResultNet} />
                </p>
                <p className="text-xs text-[#5F5E5A] mt-2">
                  Gross: <UwResult value={summary.uwResultGross} />
                </p>
              </div>
            </div>
          </Section>

          {/* ---- IBNR movement (only if movement data present) ---- */}
          {summary.hasMovementData && (
            <Section title="IBNR Movement">
              <IbnrCard summary={summary} />
            </Section>
          )}

          {/* ---- Periods table ---- */}
          <Section title="Period Performance">
            <PeriodsTable periods={periods} />
          </Section>

          {/* ---- Broker performance table ---- */}
          <Section title="Broker Performance">
            <BrokerTable brokers={brokerPerformance} />
          </Section>

          {/* ---- Class breakdown table ---- */}
          <Section title="Class of Business Breakdown">
            <ClassTable classes={classBreakdown} totalGwp={summary.totalGwp} />
          </Section>

          {/* ---- Scenario Modeller ---- */}
          <Section title="Scenario Modeller">
            <ScenarioModeller
              totalIncurred={summary.totalIncurred}
              totalNetWp={summary.totalNetWp}
            />
          </Section>

        </div>
      )}
    </div>
  );
}
