'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid, Legend,
} from 'recharts';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '../types';

interface Props { role: UserRole; userId: string; filters: FilterState }

interface Headlines {
  uwResult: number | null;
  ibnrBalance: number | null;
  sasriaExposure: number | null;
  reserveMovementMtd: number | null;
}

interface MonthlyPoint { month: string; incurred: number; lossRatio: number | null; targetLossRatio: number | null }
interface IbnrRow { period: string; ibnrOpen: number; ibnrClose: number; movement: number; isAlert: boolean }
interface Sasria { grossPremium: number | null; commission: number | null; dueFromBroker: number | null; dueToSasria: number | null }

interface Data {
  hasMovementData: boolean;
  headlines: Headlines;
  monthlyTrend: MonthlyPoint[];
  ibnrMovement: IbnrRow[];
  sasria: Sasria | null;
}

function fmt(n: number | null): string {
  if (n === null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}R${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}R${(abs / 1_000).toFixed(0)}K`;
  return `${sign}R${abs.toLocaleString('en-ZA')}`;
}

function HeadlineCard({ label, value, positive }: { label: string; value: string; positive?: boolean | null }) {
  const color = positive === null || positive === undefined ? '#0D2761'
    : positive ? '#065F46' : '#991B1B';
  return (
    <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-2">{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

export function FinancialSummary({ filters }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.period) params.set('period', filters.period);
    if (filters.netGross) params.set('netGross', filters.netGross);

    setLoading(true);
    fetch(`/api/dashboard/executive/financial-summary?${params}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [filters.period, filters.netGross]);

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-[#F4F6FA] rounded-xl animate-pulse" />)}</div>;
  if (error) return <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-5 py-4 text-sm text-[#991B1B]">{error}</div>;
  if (!data) return null;

  const h = data.headlines;

  return (
    <div className="space-y-5">
      {/* Headlines */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <HeadlineCard label="UW Result" value={fmt(h.uwResult)} positive={h.uwResult !== null ? h.uwResult > 0 : null} />
        <HeadlineCard label="IBNR Balance" value={fmt(h.ibnrBalance)} />
        <HeadlineCard label="SASRIA Exposure" value={fmt(h.sasriaExposure)} />
        <HeadlineCard label="Reserve Movement (MTD)" value={fmt(h.reserveMovementMtd)} positive={h.reserveMovementMtd !== null ? h.reserveMovementMtd <= 0 : null} />
      </div>

      {/* Monthly trend chart */}
      {data.monthlyTrend.length > 0 && (
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-4">Monthly loss ratio trend</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v) => [`${typeof v === 'number' ? v.toFixed(1) : Number(v ?? 0).toFixed(1)}%`]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="lossRatio" name="Loss ratio" stroke="#1E5BC6" strokeWidth={2} dot={false} />
                {data.monthlyTrend[0]?.targetLossRatio && (
                  <ReferenceLine y={data.monthlyTrend[0].targetLossRatio} stroke="#F5A800" strokeDasharray="4 2" label={{ value: 'Target', fontSize: 10, fill: '#92400E' }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* IBNR movement */}
      {data.ibnrMovement.length > 0 && (
        <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#E8EEF8]">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">IBNR movement</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#F4F6FA]">
              <tr>
                {['Period','Opening','Closing','Movement'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.ibnrMovement.map(row => (
                <tr key={row.period} className={`border-t border-[#E8EEF8] ${row.isAlert ? 'bg-[#FFFBEB]' : ''}`}>
                  <td className="px-4 py-2.5 text-xs font-medium text-[#0D2761]">{row.period}</td>
                  <td className="px-4 py-2.5 text-xs text-[#0D2761]">{fmt(row.ibnrOpen)}</td>
                  <td className="px-4 py-2.5 text-xs text-[#0D2761]">{fmt(row.ibnrClose)}</td>
                  <td className={`px-4 py-2.5 text-xs font-semibold ${row.movement > 0 ? 'text-[#991B1B]' : 'text-[#065F46]'}`}>
                    {row.movement > 0 ? '+' : ''}{fmt(row.movement)}
                    {row.isAlert && <span className="ml-1.5 text-[#92400E]">⚠</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SASRIA */}
      {data.sasria && (
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-3">SASRIA</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Gross premium', value: data.sasria.grossPremium },
              { label: 'Commission', value: data.sasria.commission },
              { label: 'Due from broker', value: data.sasria.dueFromBroker },
              { label: 'Due to SASRIA', value: data.sasria.dueToSasria },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[#F4F6FA] rounded-lg p-3">
                <p className="text-[10px] text-[#6B7280] mb-1">{label}</p>
                <p className="text-sm font-bold text-[#0D2761]">{fmt(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!data.hasMovementData && (
        <div className="rounded-xl border border-[#E8EEF8] bg-[#F4F6FA] px-6 py-6 text-center">
          <p className="text-xs text-[#6B7280]">No movement summary data imported yet. Import the Movement Summary report to populate this view.</p>
        </div>
      )}
    </div>
  );
}
