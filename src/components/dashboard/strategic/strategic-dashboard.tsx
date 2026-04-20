'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  TrendingDown, FileText, Clock, BarChart3, Mail,
  AlertTriangle, Shield, Activity,
} from 'lucide-react';
import {
  LineChart, Line, ResponsiveContainer, Tooltip,
} from 'recharts';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '@/components/dashboard/types';
import { DEFAULT_FILTERS } from '@/components/dashboard/types';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { PerformanceVsTarget } from '@/components/dashboard/executive/performance-vs-target';
import { FinancialSummary } from '@/components/dashboard/executive/financial-summary';
import { GrowthTrajectory } from '@/components/dashboard/executive/growth-trajectory';
import { ScenarioModeller } from '@/components/dashboard/executive/scenario-modeller';
import { BigClaimsWatch } from '@/components/dashboard/executive/big-claims-watch';

export interface Props {
  role: string;
  userId: string;
}

interface GwpVsTarget {
  gwp: number;
  target: number | null;
}

interface TrendPoint {
  month: string;
  count: number;
}

interface StrategicData {
  lossRatio: number | null;
  openClaims: number;
  tatCompliance: number | null;
  gwpVsTarget: GwpVsTarget | null;
  mailboxTatCompliance: number | null;
  bigClaimsCount: number;
  reservePosition: number | null;
  claimsTrend: TrendPoint[];
  asOf: string;
}

function formatRand(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `R ${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `R ${(value / 1_000).toFixed(0)}K`;
  }
  return `R ${value.toLocaleString('en-ZA')}`;
}

function formatPct(value: number | null): string {
  if (value === null) return '—';
  return `${value.toFixed(1)}%`;
}

function formatInt(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('en-ZA');
}

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  href: string;
  delta?: string;
  deltaPositive?: boolean;
  children?: React.ReactNode;
}

function KpiCard({ label, value, icon: Icon, href, delta, deltaPositive, children }: KpiCardProps) {
  return (
    <Link
      href={href}
      className="bg-white border border-[#E8EEF8] rounded-xl p-5 flex flex-col gap-3 hover:shadow-md hover:border-[#1E5BC6] transition-all group"
    >
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-full bg-[#1E5BC6] flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
        {delta && (
          <span className={`text-xs font-semibold ${deltaPositive ? 'text-green-600' : 'text-red-600'}`}>
            {deltaPositive ? '▲' : '▼'} {delta}
          </span>
        )}
      </div>
      <div>
        <div className="text-sm text-[#6B7280]">{label}</div>
        <div className="text-3xl font-bold text-[#0D2761] mt-0.5">{value}</div>
      </div>
      {children}
    </Link>
  );
}

const SUB_TABS = [
  { key: 'performance-vs-target', label: 'Performance vs target' },
  { key: 'financial-summary',     label: 'Financial summary' },
  { key: 'growth-trajectory',     label: 'Growth trajectory' },
  { key: 'scenario-modeller',     label: 'Scenario modeller' },
  { key: 'big-claims-watch',      label: 'Big claims watch' },
] as const;

type SubTabKey = typeof SUB_TABS[number]['key'];

const SUB_FILTERS: Record<SubTabKey, (keyof FilterState)[]> = {
  'performance-vs-target': ['productLine', 'uwYear'],
  'financial-summary':     ['period'],
  'growth-trajectory':     ['productLine', 'broker'],
  'scenario-modeller':     [],
  'big-claims-watch':      ['cause', 'handler', 'dateRange'],
};

export function StrategicDashboard({ role, userId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // KPI data state
  const [data, setData] = useState<StrategicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active sub tab — driven by ?sub= param
  const subParam = searchParams.get('sub') as SubTabKey | null;
  const activeTab: SubTabKey =
    subParam && SUB_TABS.some(t => t.key === subParam)
      ? subParam
      : SUB_TABS[0].key;

  // Filters state
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  useEffect(() => {
    fetch('/api/dashboard/strategic')
      .then(r => {
        if (!r.ok) throw new Error(`Failed: ${r.status}`);
        return r.json() as Promise<StrategicData>;
      })
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const handleTabChange = useCallback(
    (key: SubTabKey) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set('sub', key);
      router.push(`${pathname}?${p.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const handleFilterChange = useCallback(
    (key: keyof FilterState, value: string) => {
      setFilters(prev => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const subProps = { role: role as UserRole, userId, filters };
  const activeFilters = SUB_FILTERS[activeTab];

  function renderSubView() {
    switch (activeTab) {
      case 'performance-vs-target': return <PerformanceVsTarget {...subProps} />;
      case 'financial-summary':     return <FinancialSummary {...subProps} />;
      case 'growth-trajectory':     return <GrowthTrajectory {...subProps} />;
      case 'scenario-modeller':     return <ScenarioModeller {...subProps} />;
      case 'big-claims-watch':      return <BigClaimsWatch {...subProps} />;
    }
  }

  const gwpDisplay = data?.gwpVsTarget
    ? formatRand(data.gwpVsTarget.gwp)
    : '—';

  const gwpDelta = data?.gwpVsTarget?.target
    ? ((data.gwpVsTarget.gwp / data.gwpVsTarget.target) * 100).toFixed(0) + '% of target'
    : undefined;

  const gwpDeltaPositive = data?.gwpVsTarget?.target
    ? data.gwpVsTarget.gwp >= data.gwpVsTarget.target
    : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0D2761]">Strategic View</h1>
        <p className="text-sm text-[#6B7280]">Santam Emerging Business — Executive Dashboard</p>
        {data && (
          <p className="text-xs text-[#6B7280] mt-1">
            As of {new Date(data.asOf).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* KPI grid: 4x2 */}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-32 bg-[#F4F6FA] rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">{error}</div>
      )}

      {!loading && !error && data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Loss Ratio (YTD)"
            value={formatPct(data.lossRatio !== null ? data.lossRatio * 100 : null)}
            icon={TrendingDown}
            href="/finance"
            delta={data.lossRatio !== null ? `${(data.lossRatio * 100).toFixed(1)}%` : undefined}
            deltaPositive={data.lossRatio !== null ? data.lossRatio < 0.65 : undefined}
          />

          <KpiCard
            label="Open Claims"
            value={formatInt(data.openClaims)}
            icon={FileText}
            href="/claims/tat"
          />

          <KpiCard
            label="TAT Compliance"
            value={formatPct(data.tatCompliance)}
            icon={Clock}
            href="/claims/tat"
            delta={data.tatCompliance !== null ? `${data.tatCompliance.toFixed(1)}%` : undefined}
            deltaPositive={data.tatCompliance !== null ? data.tatCompliance >= 85 : undefined}
          />

          <KpiCard
            label="GWP vs Target"
            value={gwpDisplay}
            icon={BarChart3}
            href="/underwriting"
            delta={gwpDelta}
            deltaPositive={gwpDeltaPositive}
          />

          <KpiCard
            label="Mailbox TAT Compliance"
            value={formatPct(data.mailboxTatCompliance)}
            icon={Mail}
            href="/mailbox/tat"
            delta={data.mailboxTatCompliance !== null ? `${data.mailboxTatCompliance.toFixed(1)}%` : undefined}
            deltaPositive={data.mailboxTatCompliance !== null ? data.mailboxTatCompliance >= 90 : undefined}
          />

          <KpiCard
            label="Big Claims Open"
            value={formatInt(data.bigClaimsCount)}
            icon={AlertTriangle}
            href="/claims"
            delta={data.bigClaimsCount > 0 ? `${data.bigClaimsCount} flagged` : undefined}
            deltaPositive={data.bigClaimsCount === 0}
          />

          <KpiCard
            label="Reserve Position"
            value={data.reservePosition !== null ? formatRand(data.reservePosition) : '—'}
            icon={Shield}
            href="/finance"
          />

          <KpiCard
            label="Claims Trend (6mo)"
            value={data.claimsTrend.length > 0 ? formatInt(data.claimsTrend[data.claimsTrend.length - 1]?.count ?? null) : '—'}
            icon={Activity}
            href="/claims"
          >
            {data.claimsTrend.length > 1 && (
              <div className="h-12 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.claimsTrend}>
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#1E5BC6"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: '10px', padding: '4px 8px' }}
                      formatter={(v) => [v, 'Claims']}
                      labelFormatter={(l) => l}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </KpiCard>
        </div>
      )}

      {/* Sub-view tab bar */}
      <div className="border-b border-[#E8EEF8]">
        <nav className="flex gap-1 overflow-x-auto">
          {SUB_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? 'border-[#1E5BC6] text-[#1E5BC6]'
                  : 'border-transparent text-[#6B7280] hover:text-[#0D2761] hover:border-[#E8EEF8]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Filter bar */}
      {activeFilters.length > 0 && (
        <div className="pt-1 pb-1 border-b border-[#E8EEF8]">
          <FilterBar
            filters={filters}
            activeFilters={activeFilters}
            onChange={handleFilterChange}
            onClear={handleClearFilters}
          />
        </div>
      )}

      {/* Sub-view content */}
      <div className="pt-2">
        {renderSubView()}
      </div>
    </div>
  );
}
