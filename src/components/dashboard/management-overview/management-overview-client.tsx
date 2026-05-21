'use client';

import { useEffect, useState } from 'react';
import { FileText, TrendingUp, CheckCircle, Clock, DollarSign, AlertTriangle } from 'lucide-react';
import { useComparison } from '@/contexts/ComparisonContext';
import { HandlerDetailModal } from './handler-detail-modal';

interface ManagementOverviewData {
  outstandingClaims: number;
  claimsOpenedToday: number;
  claimsClosedToday: number;
  tatBreachRate: number | null;
  averageIncurred: number | null;
  largeClaimsCount: number;
  asOf: string;
  comparison: {
    outstandingClaims: number;
    claimsOpenedToday: number;
    claimsClosedToday: number;
    tatBreachRate: number | null;
    averageIncurred: number | null;
    largeClaimsCount: number;
  } | null;
}

interface HandlerSummary {
  handler: string;
  openCount: number;
  breachCount: number;
}

function formatRand(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `R ${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `R ${(value / 1_000).toFixed(0)}K`;
  return `R ${value.toLocaleString('en-ZA')}`;
}

function formatPct(value: number | null): string {
  if (value === null) return '—';
  return `${value.toFixed(1)}%`;
}

function DeltaRow({ current, previous, lowerIsBetter, isComparing, formatter }: {
  current: number | null;
  previous: number | null;
  lowerIsBetter: boolean;
  isComparing: boolean;
  formatter?: (v: number) => string;
}) {
  if (!isComparing) return null;
  if (previous === null || current === null) {
    return <p className="text-xs text-[#9CA3AF] mt-1">— select dates to compare</p>;
  }
  const delta = current - previous;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  const unchanged = Math.abs(delta) < 0.001;
  const color = unchanged ? '#6B7280' : improved ? '#16A34A' : '#DC2626';
  const arrow = unchanged ? '→' : delta < 0 ? '↓' : '↑';
  const fmt = formatter ?? ((v: number) => v.toLocaleString('en-ZA'));
  return (
    <p className="text-xs mt-1 tabular-nums" style={{ color }}>
      {arrow} {formatter ? fmt(Math.abs(delta)) : Math.abs(delta).toFixed(lowerIsBetter ? 0 : 1)}{' '}
      <span className="text-[#9CA3AF]">vs {fmt(previous)}</span>
    </p>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  iconColor?: string;
  iconBg?: string;
  trend?: string;
  trendPositive?: boolean;
  previousValue?: number | null;
  currentRaw?: number | null;
  lowerIsBetter?: boolean;
  isComparing?: boolean;
  formatter?: (v: number) => string;
}

function StatCard({ label, value, icon: Icon, iconColor = '#1E5BC6', iconBg = '#EFF6FF', trend, trendPositive, previousValue, currentRaw, lowerIsBetter = true, isComparing, formatter }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-[0_1px_3px_rgba(13,39,97,0.06)] p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: iconBg }}>
          <Icon className="w-5 h-5" style={{ color: iconColor }} strokeWidth={2} />
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${trendPositive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {trendPositive ? '▲' : '▼'} {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-sm text-[#6B7280]">{label}</p>
        <p className="text-3xl font-bold text-[#0D2761] mt-0.5">{value}</p>
        <DeltaRow
          current={currentRaw ?? null}
          previous={previousValue ?? null}
          lowerIsBetter={lowerIsBetter}
          isComparing={isComparing ?? false}
          formatter={formatter}
        />
      </div>
    </div>
  );
}

function HandlerCard({ summary, onClick }: { summary: HandlerSummary; onClick: () => void }) {
  const breachPct = summary.openCount > 0 ? (summary.breachCount / summary.openCount) * 100 : 0;
  const ringColor = breachPct > 20 ? '#DC2626' : breachPct > 10 ? '#F5A800' : '#16A34A';
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-[#E8EEF8] p-4 text-left hover:bg-[#F4F6FA] hover:shadow-md transition-all w-full"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
          style={{ borderColor: ringColor, backgroundColor: ringColor + '22', color: ringColor }}
        >
          {summary.handler.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#0D2761] truncate">{summary.handler}</p>
          <p className="text-xs text-[#6B7280]">
            {summary.openCount} open · <span style={{ color: ringColor }}>{summary.breachCount} breach{summary.breachCount !== 1 ? 'es' : ''}</span>
          </p>
        </div>
      </div>
    </button>
  );
}

export function ManagementOverviewClient() {
  const [data, setData] = useState<ManagementOverviewData | null>(null);
  const [handlers, setHandlers] = useState<HandlerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedHandler, setSelectedHandler] = useState<string | null>(null);
  const { isComparing, resolvedFromDate, resolvedToDate } = useComparison();

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (isComparing && resolvedFromDate) params.set('compareFrom', resolvedFromDate);
    if (isComparing && resolvedToDate) params.set('compareTo', resolvedToDate);
    const qs = params.toString() ? `?${params.toString()}` : '';

    Promise.all([
      fetch(`/api/dashboard/management-overview${qs}`).then(r => {
        if (!r.ok) throw new Error(`Failed: ${r.status}`);
        return r.json() as Promise<ManagementOverviewData>;
      }),
      fetch('/api/dashboard/claims/morning-brief').then(r => r.ok ? r.json() : null),
    ])
      .then(([overview, brief]) => {
        setData(overview);
        if (brief?.handlerHealth) {
          setHandlers(brief.handlerHealth.map((h: { handler: string; openCount: number; breachCount: number }) => ({
            handler: h.handler,
            openCount: h.openCount,
            breachCount: h.breachCount,
          })));
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [isComparing, resolvedFromDate, resolvedToDate]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-36 bg-[#F4F6FA] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-5 py-4 text-sm text-[#991B1B]">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const cmp = data.comparison;
  const tatBreachIsHigh = data.tatBreachRate !== null && data.tatBreachRate > 15;

  return (
    <div className="space-y-6">
      {data.asOf && (
        <p className="text-xs text-[#6B7280]">
          Data as of{' '}
          {new Date(data.asOf).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Outstanding Claims"
          value={data.outstandingClaims.toLocaleString('en-ZA')}
          icon={FileText}
          currentRaw={data.outstandingClaims}
          previousValue={cmp?.outstandingClaims}
          lowerIsBetter
          isComparing={isComparing}
        />
        <StatCard
          label="Claims Opened Today"
          value={data.claimsOpenedToday.toLocaleString('en-ZA')}
          icon={TrendingUp}
          iconColor="#F5A800"
          iconBg="#FFFBEB"
          trend={data.claimsOpenedToday > 0 ? `${data.claimsOpenedToday} new` : undefined}
          trendPositive={false}
          currentRaw={data.claimsOpenedToday}
          previousValue={cmp?.claimsOpenedToday}
          lowerIsBetter={false}
          isComparing={isComparing}
        />
        <StatCard
          label="Claims Closed Today"
          value={data.claimsClosedToday.toLocaleString('en-ZA')}
          icon={CheckCircle}
          iconColor="#065F46"
          iconBg="#ECFDF5"
          trend={data.claimsClosedToday > 0 ? `${data.claimsClosedToday} finalised` : undefined}
          trendPositive
          currentRaw={data.claimsClosedToday}
          previousValue={cmp?.claimsClosedToday}
          lowerIsBetter={false}
          isComparing={isComparing}
        />
        <StatCard
          label="TAT Breach Rate"
          value={formatPct(data.tatBreachRate)}
          icon={Clock}
          iconColor={tatBreachIsHigh ? '#991B1B' : '#065F46'}
          iconBg={tatBreachIsHigh ? '#FEF2F2' : '#ECFDF5'}
          trend={data.tatBreachRate !== null ? formatPct(data.tatBreachRate) : undefined}
          trendPositive={!tatBreachIsHigh}
          currentRaw={data.tatBreachRate}
          previousValue={cmp?.tatBreachRate}
          lowerIsBetter
          isComparing={isComparing}
          formatter={(v) => `${v.toFixed(1)}%`}
        />
        <StatCard
          label="Average Incurred"
          value={data.averageIncurred !== null ? formatRand(data.averageIncurred) : '—'}
          icon={DollarSign}
          currentRaw={data.averageIncurred}
          previousValue={cmp?.averageIncurred}
          lowerIsBetter
          isComparing={isComparing}
          formatter={formatRand}
        />
        <StatCard
          label="Large Claims (>R250k)"
          value={data.largeClaimsCount.toLocaleString('en-ZA')}
          icon={AlertTriangle}
          iconColor={data.largeClaimsCount > 0 ? '#F5A800' : '#065F46'}
          iconBg={data.largeClaimsCount > 0 ? '#FFFBEB' : '#ECFDF5'}
          trend={data.largeClaimsCount > 0 ? `${data.largeClaimsCount} flagged` : undefined}
          trendPositive={false}
          currentRaw={data.largeClaimsCount}
          previousValue={cmp?.largeClaimsCount}
          lowerIsBetter
          isComparing={isComparing}
        />
      </div>

      {/* Handler Performance section */}
      {handlers.length > 0 && (
        <section>
          <h2 className="text-sm font-bold tracking-widest text-[#0D2761] uppercase mb-3">
            Handler Performance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {handlers.map(h => (
              <HandlerCard
                key={h.handler}
                summary={h}
                onClick={() => setSelectedHandler(h.handler)}
              />
            ))}
          </div>
        </section>
      )}

      {selectedHandler && (
        <HandlerDetailModal
          handler={selectedHandler}
          toDate={data.asOf ? data.asOf.split('T')[0] : undefined}
          fromDate={isComparing && resolvedFromDate ? resolvedFromDate : undefined}
          isComparing={isComparing && !!(resolvedFromDate && resolvedToDate)}
          onClose={() => setSelectedHandler(null)}
        />
      )}
    </div>
  );
}
