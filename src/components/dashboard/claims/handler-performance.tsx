'use client';

import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '@/components/dashboard/types';

interface HandlerPerformanceData {
  scorecards: Array<{
    handler: string;
    openCount: number;
    workloadScore: number;
    capacity: number;
    finalisationGlass: number | null;
    finalisationComplex: number | null;
    paymentRate: number | null;
    slaCompliance: number | null;
    csScore: number | null;
    breachCount: number;
    acknowledgedDelayCount: number;
  }>;
}

interface SubViewProps {
  role: UserRole;
  userId: string;
  filters: FilterState;
}

const GLASS_TARGET = 75;
const COMPLEX_TARGET = 35;
const CAPACITY_WARN = 90;

function fmt(v: number | null, suffix = '%') {
  if (v === null) return '—';
  return `${v}${suffix}`;
}

function WorkloadBar({ score, capacity }: { score: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min((score / capacity) * 100, 100) : 0;
  const isOver = capacity > 0 && score > capacity;
  const isWarn = capacity > 0 && score / capacity > CAPACITY_WARN / 100;
  const barColor = isOver ? '#E24B4A' : isWarn ? '#F5A800' : '#1E5BC6';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#6B7280]">Workload</span>
        <span className={`text-xs font-semibold ${isOver ? 'text-[#E24B4A]' : isWarn ? 'text-[#92400E]' : 'text-[#0D2761]'}`}>
          {score} / {capacity}
        </span>
      </div>
      <div className="h-2 bg-[#E8EEF8] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

function ScorecardChip({ children, variant }: { children: React.ReactNode; variant: 'red' | 'amber' | 'gray' }) {
  const cls =
    variant === 'red'
      ? 'bg-[#FEE2E2] text-[#991B1B]'
      : variant === 'amber'
      ? 'bg-[#FFF9EC] text-[#92400E]'
      : 'bg-[#F4F6FA] text-[#6B7280]';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

type Scorecard = HandlerPerformanceData['scorecards'][number];

function HandlerCard({ card }: { card: Scorecard }) {
  const glassAbove = card.finalisationGlass !== null && card.finalisationGlass >= GLASS_TARGET;
  const complexAbove = card.finalisationComplex !== null && card.finalisationComplex >= COMPLEX_TARGET;

  return (
    <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4 flex flex-col gap-3">
      {/* Header */}
      <div>
        <p className="font-semibold text-[#0D2761] text-sm">{card.handler}</p>
        <p className="text-xs text-[#6B7280]">Claims handler</p>
      </div>

      {/* Workload bar */}
      <WorkloadBar score={card.workloadScore} capacity={card.capacity} />

      {/* Metrics */}
      <div className="space-y-1">
        <p className="text-xs text-[#6B7280]">
          Glass finalisation:{' '}
          <span className="font-semibold text-[#0D2761]">
            {fmt(card.finalisationGlass)}
          </span>{' '}
          <span className={card.finalisationGlass !== null ? (glassAbove ? 'text-[#059669]' : 'text-[#E24B4A]') : ''}>
            {card.finalisationGlass !== null ? (glassAbove ? '↑' : '↓') : ''}
          </span>
          {' '}| Complex:{' '}
          <span className="font-semibold text-[#0D2761]">
            {fmt(card.finalisationComplex)}
          </span>{' '}
          <span className={card.finalisationComplex !== null ? (complexAbove ? 'text-[#059669]' : 'text-[#E24B4A]') : ''}>
            {card.finalisationComplex !== null ? (complexAbove ? '↑' : '↓') : ''}
          </span>
        </p>

        {card.slaCompliance !== null && (
          <p className="text-xs text-[#6B7280]">
            SLA compliance:{' '}
            <span className="font-semibold text-[#0D2761]">{card.slaCompliance}% within SLA</span>
          </p>
        )}

        {card.csScore !== null && (
          <p className="text-xs text-[#6B7280]">
            CS score: <span className="font-semibold text-[#0D2761]">{card.csScore}/100</span>
          </p>
        )}
      </div>

      {/* Footer chips */}
      <div className="flex flex-wrap gap-1.5">
        {card.breachCount > 0 && (
          <ScorecardChip variant="red">{card.breachCount} SLA {card.breachCount === 1 ? 'breach' : 'breaches'}</ScorecardChip>
        )}
        {card.acknowledgedDelayCount > 0 && (
          <ScorecardChip variant="amber">{card.acknowledgedDelayCount} acknowledged {card.acknowledgedDelayCount === 1 ? 'delay' : 'delays'}</ScorecardChip>
        )}
        <ScorecardChip variant="gray">Open: {card.openCount} claims</ScorecardChip>
      </div>
    </div>
  );
}

const EMPTY = 'No data yet — import a Claims Outstanding report to populate the dashboard.';

export function HandlerPerformance({ role, userId: _userId, filters }: SubViewProps) {
  const [data, setData] = useState<HandlerPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    const keys = Object.keys(filters) as (keyof FilterState)[];
    for (const k of keys) {
      const v = filters[k] as string;
      if (v) params.set(k, v);
    }
    fetch(`/api/dashboard/claims/handler-performance?${params}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then((json: HandlerPerformanceData | null) => { if (json) setData(json); })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [filters]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />
        <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />
      </div>
    );
  }

  const scorecards = data?.scorecards ?? [];

  // Role-based filtering: CLAIMS_TECHNICIAN sees only their own card
  const visibleCards =
    role === 'CLAIMS_TECHNICIAN'
      ? scorecards.filter(s => s.handler === filters.handler || scorecards.length === 1)
      : scorecards;

  const maxCapacity = Math.max(...scorecards.map(s => s.capacity), 1);
  const chartMax = Math.ceil(maxCapacity * 1.15);

  return (
    <div className="space-y-8">
      <h2 className="text-base font-semibold text-[#0D2761]">Handler performance</h2>

      {visibleCards.length === 0 ? (
        <p className="text-sm text-[#6B7280]">{EMPTY}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleCards.map(card => (
            <HandlerCard key={card.handler} card={card} />
          ))}
        </div>
      )}

      {/* Workload balance chart */}
      {scorecards.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[#0D2761] mb-3">Workload balance</h3>
          <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
            <ResponsiveContainer width="100%" height={Math.max(200, scorecards.length * 40)}>
              <BarChart
                data={scorecards.map(s => ({
                  handler: s.handler,
                  workload: s.workloadScore,
                  capacity: s.capacity,
                  fill: s.workloadScore > s.capacity ? '#E24B4A' : s.capacity > 0 && s.workloadScore / s.capacity > CAPACITY_WARN / 100 ? '#F5A800' : '#1E5BC6',
                }))}
                layout="vertical"
                margin={{ left: 10, right: 20 }}
              >
                <XAxis type="number" domain={[0, chartMax]} tick={{ fontSize: 10, fill: '#6B7280' }} />
                <YAxis type="category" dataKey="handler" width={120} tick={{ fontSize: 11, fill: '#0D2761' }} />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [`${v}`, name === 'workload' ? 'Workload' : 'Capacity'] as [string, string]}
                  cursor={{ fill: '#F4F6FA' }}
                />
                <Bar dataKey="workload" radius={[0, 3, 3, 0]}>
                  {scorecards.map((s, i) => {
                    const isOver = s.workloadScore > s.capacity;
                    const isWarn = !isOver && s.capacity > 0 && s.workloadScore / s.capacity > CAPACITY_WARN / 100;
                    const color = isOver ? '#E24B4A' : isWarn ? '#F5A800' : '#1E5BC6';
                    // We render per-bar color via CSS variable trick — use cell fill
                    return <rect key={i} style={{ fill: color }} />;
                  })}
                </Bar>
                <ReferenceLine x={maxCapacity} stroke="#059669" strokeDasharray="4 3" label={{ value: 'Capacity', fontSize: 10, fill: '#059669' }} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 justify-end">
              <span className="text-xs text-[#6B7280] flex items-center gap-1">
                <span className="w-3 h-0.5 bg-[#059669] inline-block" style={{ borderTop: '2px dashed #059669', display: 'inline-block' }} />
                Capacity
              </span>
              <span className="text-xs text-[#6B7280]">Glass target: {GLASS_TARGET}%</span>
              <span className="text-xs text-[#6B7280]">Complex target: {COMPLEX_TARGET}%</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
