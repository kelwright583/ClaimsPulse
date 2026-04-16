'use client';

import { useEffect, useState } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '../types';

interface Props { role: UserRole; userId: string; filters: FilterState }

interface TrajPoint { month: string; actual: number | null; projected: number | null; isProjected: boolean }
interface NbPoint { month: string; renewals: number; newBusiness: number; cancellations: number }
interface Insights {
  projectedYeNwp: number | null;
  nwpTarget: number | null;
  newBusinessRate: number | null;
  lapseRate: number;
  lapseRateTrend: 'rising' | 'flat' | 'falling' | null;
}
interface Data {
  hasRevenueData: boolean;
  nwpTrajectory: TrajPoint[];
  nwpTarget: number | null;
  policyTrajectory: (TrajPoint & { isApproximate: boolean })[];
  policyTarget: number | null;
  nbVsRenewals: NbPoint[];
  insights: Insights;
}

function fmt(n: number | null): string {
  if (n === null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}R${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}R${(abs / 1_000).toFixed(0)}K`;
  return `${sign}R${abs.toLocaleString('en-ZA')}`;
}

function pct(n: number | null): string {
  if (n === null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

const TREND_LABEL = { rising: '↑ Rising', flat: '→ Flat', falling: '↓ Falling' };
const TREND_COLOR = { rising: '#991B1B', flat: '#92400E', falling: '#065F46' };

export function GrowthTrajectory({ filters: _filters }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/dashboard/executive/growth-trajectory')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-[#F4F6FA] rounded-xl animate-pulse" />)}</div>;
  if (error) return <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-5 py-4 text-sm text-[#991B1B]">{error}</div>;
  if (!data) return null;

  if (!data.hasRevenueData) {
    return (
      <div className="rounded-xl border border-[#E8EEF8] bg-[#F4F6FA] px-6 py-10 text-center">
        <p className="text-sm font-semibold text-[#0D2761] mb-1">No premium data imported</p>
        <p className="text-xs text-[#6B7280]">Import the Premium Register to see growth trajectory.</p>
      </div>
    );
  }

  const { insights, nwpTrajectory, policyTrajectory, nbVsRenewals, nwpTarget, policyTarget } = data;
  const trend = insights.lapseRateTrend;

  return (
    <div className="space-y-5">
      {/* Insights strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-2">Projected YE NWP</p>
          <p className="text-2xl font-bold text-[#0D2761]">{fmt(insights.projectedYeNwp)}</p>
          {insights.nwpTarget && (
            <p className="text-[11px] text-[#6B7280] mt-1">Target: {fmt(insights.nwpTarget)}</p>
          )}
        </div>
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-2">NWP vs Target</p>
          <p className="text-2xl font-bold" style={{
            color: insights.projectedYeNwp && insights.nwpTarget
              ? insights.projectedYeNwp >= insights.nwpTarget ? '#065F46' : '#991B1B'
              : '#0D2761'
          }}>
            {insights.projectedYeNwp && insights.nwpTarget
              ? `${((insights.projectedYeNwp / insights.nwpTarget) * 100).toFixed(0)}%`
              : '—'}
          </p>
          <p className="text-[11px] text-[#6B7280] mt-1">of annual target</p>
        </div>
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-2">NB Rate</p>
          <p className="text-2xl font-bold text-[#0D2761]">{pct(insights.newBusinessRate)}</p>
          <p className="text-[11px] text-[#6B7280] mt-1">of total written premium</p>
        </div>
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-2">Lapse Rate (3mo)</p>
          <p className="text-2xl font-bold" style={{ color: trend ? TREND_COLOR[trend] : '#0D2761' }}>
            {pct(insights.lapseRate)}
          </p>
          {trend && (
            <p className="text-[11px] mt-1" style={{ color: TREND_COLOR[trend] }}>
              {TREND_LABEL[trend]}
            </p>
          )}
        </div>
      </div>

      {/* NWP trajectory chart */}
      {nwpTrajectory.length > 0 && (
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-4">NWP trajectory</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={nwpTrajectory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmt(v)} width={70} />
                <Tooltip formatter={(v: number, name: string) => [fmt(v), name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="actual" name="Actual NWP" stroke="#1E5BC6" strokeWidth={2} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="projected" name="Projected" stroke="#1E5BC6" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls={false} />
                {nwpTarget && (
                  <ReferenceLine y={nwpTarget / 12} stroke="#F5A800" strokeDasharray="4 2" label={{ value: 'Monthly target', fontSize: 9, fill: '#92400E' }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Policy in-force trajectory */}
      {policyTrajectory.length > 0 && (
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-4">Policies in force</h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={policyTrajectory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, name: string) => [v?.toLocaleString('en-ZA'), name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="actual" name="Actual" stroke="#0D2761" strokeWidth={2} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="projected" name="Projected" stroke="#0D2761" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls={false} />
                {policyTarget && (
                  <ReferenceLine y={policyTarget} stroke="#F5A800" strokeDasharray="4 2" label={{ value: 'Target', fontSize: 9, fill: '#92400E' }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* NB vs Renewals stacked bar */}
      {nbVsRenewals.length > 0 && (
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-4">New business vs renewals vs cancellations</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={nbVsRenewals}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmt(v)} width={70} />
                <Tooltip formatter={(v: number, name: string) => [fmt(Math.abs(v)), name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="renewals" name="Renewals" stackId="a" fill="#1E5BC6" />
                <Bar dataKey="newBusiness" name="New Business" stackId="a" fill="#065F46" />
                <Bar dataKey="cancellations" name="Cancellations" stackId="a" fill="#991B1B" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
