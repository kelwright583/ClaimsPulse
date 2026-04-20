'use client';

import { useEffect, useState } from 'react';
import { FileText, TrendingUp, CheckCircle, Clock, DollarSign, AlertTriangle } from 'lucide-react';

interface ManagementOverviewData {
  outstandingClaims: number;
  claimsOpenedToday: number;
  claimsClosedToday: number;
  tatBreachRate: number | null;
  averageIncurred: number | null;
  largeClaimsCount: number;
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

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  iconColor?: string;
  iconBg?: string;
  trend?: string;
  trendPositive?: boolean;
}

function StatCard({ label, value, icon: Icon, iconColor = '#1E5BC6', iconBg = '#EFF6FF', trend, trendPositive }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-[0_1px_3px_rgba(13,39,97,0.06)] p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          <Icon className="w-5 h-5" style={{ color: iconColor }} strokeWidth={2} />
        </div>
        {trend !== undefined && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              trendPositive
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {trendPositive ? '▲' : '▼'} {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-sm text-[#6B7280]">{label}</p>
        <p className="text-3xl font-bold text-[#0D2761] mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export function ManagementOverviewClient() {
  const [data, setData] = useState<ManagementOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/management-overview')
      .then(r => {
        if (!r.ok) throw new Error(`Failed: ${r.status}`);
        return r.json() as Promise<ManagementOverviewData>;
      })
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

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

  const tatBreachIsHigh = data.tatBreachRate !== null && data.tatBreachRate > 15;

  return (
    <div className="space-y-4">
      {data.asOf && (
        <p className="text-xs text-[#6B7280]">
          Data as of{' '}
          {new Date(data.asOf).toLocaleDateString('en-ZA', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Outstanding Claims"
          value={data.outstandingClaims.toLocaleString('en-ZA')}
          icon={FileText}
          iconColor="#1E5BC6"
          iconBg="#EFF6FF"
        />

        <StatCard
          label="Claims Opened Today"
          value={data.claimsOpenedToday.toLocaleString('en-ZA')}
          icon={TrendingUp}
          iconColor="#F5A800"
          iconBg="#FFFBEB"
          trend={data.claimsOpenedToday > 0 ? `${data.claimsOpenedToday} new` : undefined}
          trendPositive={false}
        />

        <StatCard
          label="Claims Closed Today"
          value={data.claimsClosedToday.toLocaleString('en-ZA')}
          icon={CheckCircle}
          iconColor="#065F46"
          iconBg="#ECFDF5"
          trend={data.claimsClosedToday > 0 ? `${data.claimsClosedToday} finalised` : undefined}
          trendPositive={true}
        />

        <StatCard
          label="TAT Breach Rate"
          value={formatPct(data.tatBreachRate)}
          icon={Clock}
          iconColor={tatBreachIsHigh ? '#991B1B' : '#065F46'}
          iconBg={tatBreachIsHigh ? '#FEF2F2' : '#ECFDF5'}
          trend={data.tatBreachRate !== null ? formatPct(data.tatBreachRate) : undefined}
          trendPositive={!tatBreachIsHigh}
        />

        <StatCard
          label="Average Incurred"
          value={data.averageIncurred !== null ? formatRand(data.averageIncurred) : '—'}
          icon={DollarSign}
          iconColor="#1E5BC6"
          iconBg="#EFF6FF"
        />

        <StatCard
          label="Large Claims (>R250k)"
          value={data.largeClaimsCount.toLocaleString('en-ZA')}
          icon={AlertTriangle}
          iconColor={data.largeClaimsCount > 0 ? '#F5A800' : '#065F46'}
          iconBg={data.largeClaimsCount > 0 ? '#FFFBEB' : '#ECFDF5'}
          trend={data.largeClaimsCount > 0 ? `${data.largeClaimsCount} flagged` : undefined}
          trendPositive={false}
        />
      </div>
    </div>
  );
}
