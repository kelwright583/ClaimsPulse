'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TrendingDown, FileText, Clock, BarChart3, Mail,
  AlertTriangle, Shield, Activity,
} from 'lucide-react';
import {
  LineChart, Line, ResponsiveContainer, Tooltip,
} from 'recharts';

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
  slaCompliance: number | null;
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

export function StrategicDashboard() {
  const [data, setData] = useState<StrategicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#6B7280]">
        Loading strategic view…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">{error}</div>
    );
  }

  if (!data) return null;

  const gwpDisplay = data.gwpVsTarget
    ? formatRand(data.gwpVsTarget.gwp)
    : '—';

  const gwpDelta = data.gwpVsTarget?.target
    ? ((data.gwpVsTarget.gwp / data.gwpVsTarget.target) * 100).toFixed(0) + '% of target'
    : undefined;

  const gwpDeltaPositive = data.gwpVsTarget?.target
    ? data.gwpVsTarget.gwp >= data.gwpVsTarget.target
    : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0D2761]">Strategic View</h1>
        <p className="text-sm text-[#6B7280]">Santam Emerging Business — Executive Dashboard</p>
        <p className="text-xs text-[#6B7280] mt-1">
          As of {new Date(data.asOf).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      </div>

      {/* KPI grid: 4x2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Loss ratio */}
        <KpiCard
          label="Loss Ratio (YTD)"
          value={formatPct(data.lossRatio !== null ? data.lossRatio * 100 : null)}
          icon={TrendingDown}
          href="/financial"
          delta={data.lossRatio !== null ? `${(data.lossRatio * 100).toFixed(1)}%` : undefined}
          deltaPositive={data.lossRatio !== null ? data.lossRatio < 0.65 : undefined}
        />

        {/* 2. Open claims */}
        <KpiCard
          label="Open Claims"
          value={formatInt(data.openClaims)}
          icon={FileText}
          href="/sla"
        />

        {/* 3. SLA compliance */}
        <KpiCard
          label="SLA Compliance"
          value={formatPct(data.slaCompliance)}
          icon={Clock}
          href="/sla"
          delta={data.slaCompliance !== null ? `${data.slaCompliance.toFixed(1)}%` : undefined}
          deltaPositive={data.slaCompliance !== null ? data.slaCompliance >= 85 : undefined}
        />

        {/* 4. GWP vs target */}
        <KpiCard
          label="GWP vs Target"
          value={gwpDisplay}
          icon={BarChart3}
          href="/underwriting"
          delta={gwpDelta}
          deltaPositive={gwpDeltaPositive}
        />

        {/* 5. Mailbox TAT */}
        <KpiCard
          label="Mailbox TAT Compliance"
          value={formatPct(data.mailboxTatCompliance)}
          icon={Mail}
          href="/mailbox/tat"
          delta={data.mailboxTatCompliance !== null ? `${data.mailboxTatCompliance.toFixed(1)}%` : undefined}
          deltaPositive={data.mailboxTatCompliance !== null ? data.mailboxTatCompliance >= 90 : undefined}
        />

        {/* 6. Big claims */}
        <KpiCard
          label="Big Claims Open"
          value={formatInt(data.bigClaimsCount)}
          icon={AlertTriangle}
          href="/dashboard"
          delta={data.bigClaimsCount > 0 ? `${data.bigClaimsCount} flagged` : undefined}
          deltaPositive={data.bigClaimsCount === 0}
        />

        {/* 7. Reserve position */}
        <KpiCard
          label="Reserve Position"
          value={data.reservePosition !== null ? formatRand(data.reservePosition) : '—'}
          icon={Shield}
          href="/financial"
        />

        {/* 8. Claims trend (sparkline) */}
        <KpiCard
          label="Claims Trend (6mo)"
          value={data.claimsTrend.length > 0 ? formatInt(data.claimsTrend[data.claimsTrend.length - 1]?.count ?? null) : '—'}
          icon={Activity}
          href="/dashboard"
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
    </div>
  );
}
