'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '../types';

interface Props { role: UserRole; userId: string; filters: FilterState }

interface Summary { claimsOver250k: number; theftHijackOpen: number; totalExposure: number }
interface Claim {
  claimId: string;
  insured: string | null;
  handler: string | null;
  cause: string | null;
  claimStatus: string | null;
  secondaryStatus: string | null;
  dateOfLoss: string | null;
  totalIncurred: number | null;
  totalOs: number | null;
  totalPaid: number | null;
  daysOpen: number | null;
  isSlaBreach: boolean;
  lossArea: string | null;
}
interface TrendPoint { month: string; count: number; totalIncurred: number }
interface Data { summary: Summary; claims: Claim[]; monthlyTrend: TrendPoint[] }

function fmt(n: number | null): string {
  if (n === null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}R${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}R${(abs / 1_000).toFixed(0)}K`;
  return `${sign}R${abs.toLocaleString('en-ZA')}`;
}

const CAUSE_OPTIONS = ['', 'Vehicle theft', 'Vehicle hijack', 'Fire', 'Flood', 'Storm'];
const DATE_OPTIONS = [
  { value: '', label: 'All dates' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'last-3-months', label: 'Last 3 months' },
  { value: 'ytd', label: 'YTD' },
];

export function BigClaimsWatch({ filters: _filters }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cause, setCause] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [handlerFilter, setHandlerFilter] = useState('');
  const [sortKey, setSortKey] = useState<'totalIncurred' | 'daysOpen'>('totalIncurred');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (cause) params.set('cause', cause);
    if (dateRange) params.set('dateRange', dateRange);
    if (handlerFilter) params.set('handler', handlerFilter);

    fetch(`/api/dashboard/executive/big-claims?${params}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [cause, dateRange, handlerFilter]);

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-[#F4F6FA] rounded-xl animate-pulse" />)}</div>;
  if (error) return <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-5 py-4 text-sm text-[#991B1B]">{error}</div>;
  if (!data) return null;

  const { summary, claims, monthlyTrend } = data;
  const sorted = [...claims].sort((a, b) => {
    if (sortKey === 'totalIncurred') return (b.totalIncurred ?? 0) - (a.totalIncurred ?? 0);
    return (b.daysOpen ?? 0) - (a.daysOpen ?? 0);
  });

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-2">Claims &gt; R250K</p>
          <p className="text-3xl font-bold text-[#0D2761]">{summary.claimsOver250k}</p>
        </div>
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-2">Theft/Hijack Open</p>
          <p className="text-3xl font-bold text-[#991B1B]">{summary.theftHijackOpen}</p>
        </div>
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-2">Total Exposure</p>
          <p className="text-3xl font-bold text-[#0D2761]">{fmt(summary.totalExposure)}</p>
        </div>
      </div>

      {/* Monthly trend */}
      {monthlyTrend.length > 0 && (
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-4">Monthly count of big claims</h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [v, 'Claims']} />
                <Bar dataKey="count" fill="#1E5BC6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={cause}
          onChange={e => setCause(e.target.value)}
          className="border border-[#E8EEF8] rounded-lg px-3 py-1.5 text-xs text-[#0D2761] focus:outline-none focus:border-[#1E5BC6]"
        >
          <option value="">All causes</option>
          {CAUSE_OPTIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={dateRange}
          onChange={e => setDateRange(e.target.value)}
          className="border border-[#E8EEF8] rounded-lg px-3 py-1.5 text-xs text-[#0D2761] focus:outline-none focus:border-[#1E5BC6]"
        >
          {DATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          value={handlerFilter}
          onChange={e => setHandlerFilter(e.target.value)}
          placeholder="Filter by handler…"
          className="border border-[#E8EEF8] rounded-lg px-3 py-1.5 text-xs text-[#0D2761] focus:outline-none focus:border-[#1E5BC6] w-44"
        />
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setSortKey('totalIncurred')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${sortKey === 'totalIncurred' ? 'bg-[#0D2761] text-white' : 'bg-[#F4F6FA] text-[#6B7280] hover:bg-[#E8EEF8]'}`}
          >
            Sort: Amount
          </button>
          <button
            onClick={() => setSortKey('daysOpen')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${sortKey === 'daysOpen' ? 'bg-[#0D2761] text-white' : 'bg-[#F4F6FA] text-[#6B7280] hover:bg-[#E8EEF8]'}`}
          >
            Sort: Days open
          </button>
        </div>
      </div>

      {/* Claims table */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-[#E8EEF8] bg-[#F4F6FA] px-6 py-8 text-center">
          <p className="text-xs text-[#6B7280]">No claims over R250,000 found for the selected filters.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F4F6FA]">
                <tr>
                  {['Claim ID', 'Insured', 'Cause', 'Status', 'Handler', 'Date of loss', 'Total incurred', 'O/S', 'Days open', 'SLA'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6B7280] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(row => (
                  <tr key={row.claimId} className={`border-t border-[#E8EEF8] ${row.isSlaBreach ? 'bg-[#FEF2F2]' : 'hover:bg-[#F4F6FA]/50'}`}>
                    <td className="px-4 py-2.5 text-xs font-mono font-medium text-[#0D2761]">{row.claimId}</td>
                    <td className="px-4 py-2.5 text-xs text-[#0D2761] max-w-[120px] truncate">{row.insured ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-[#0D2761]">{row.cause ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-[#0D2761]">{row.claimStatus ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-[#0D2761]">{row.handler ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-[#6B7280]">{row.dateOfLoss ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-[#0D2761]">{fmt(row.totalIncurred)}</td>
                    <td className="px-4 py-2.5 text-xs text-[#0D2761]">{fmt(row.totalOs)}</td>
                    <td className="px-4 py-2.5 text-xs text-[#0D2761]">{row.daysOpen ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {row.isSlaBreach
                        ? <span className="text-[#991B1B] font-semibold">Breach</span>
                        : <span className="text-[#065F46]">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
