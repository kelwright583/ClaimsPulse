'use client';

import { useEffect, useState } from 'react';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '../types';

interface Props { role: UserRole; userId: string; filters: FilterState }

interface MetricRow {
  actual: number | null;
  target: number | null;
  projectedYE: number | null;
  requiredMonthly: number | null;
  status: 'green' | 'amber' | 'red' | null;
}

interface ProductLineRow {
  productLine: string;
  lossRatioActual: number | null;
  lossRatioTarget: number | null;
  totalIncurred: number;
  netWp: number | null;
  claimCount: number;
  status: 'green' | 'amber' | 'red';
}

interface Data {
  hasTargets: boolean;
  lossRatio: MetricRow;
  netWp: MetricRow;
  policyCount: MetricRow;
  byProductLine: ProductLineRow[];
}

const STATUS_COLORS = { green: '#065F46', amber: '#92400E', red: '#991B1B' };
const STATUS_BG = { green: '#ECFDF5', amber: '#FFFBEB', red: '#FEF2F2' };
const STATUS_DOT = { green: 'bg-[#065F46]', amber: 'bg-[#F5A800]', red: 'bg-[#991B1B]' };

function fmt(n: number | null, type: 'pct' | 'rand' | 'int'): string {
  if (n === null) return '—';
  if (type === 'pct') return `${n.toFixed(1)}%`;
  if (type === 'rand') {
    if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(0)}K`;
    return `R${n.toLocaleString('en-ZA')}`;
  }
  return n.toLocaleString('en-ZA');
}

function MetricBlock({ label, row, formatType }: { label: string; row: MetricRow; formatType: 'pct' | 'rand' | 'int' }) {
  const s = row.status;
  return (
    <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">{label}</p>
        {s && (
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: STATUS_BG[s], color: STATUS_COLORS[s] }}
          >
            {s === 'green' ? 'On track' : s === 'amber' ? 'At risk' : 'Off track'}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-[#6B7280] mb-0.5">Actual (YTD)</p>
          <p className="text-xl font-bold text-[#0D2761]">{fmt(row.actual, formatType)}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#6B7280] mb-0.5">Target (annual)</p>
          <p className="text-xl font-bold text-[#6B7280]">{fmt(row.target, formatType)}</p>
        </div>
        {row.projectedYE !== null && (
          <div>
            <p className="text-[10px] text-[#6B7280] mb-0.5">Projected YE</p>
            <p className="text-sm font-semibold" style={{ color: s ? STATUS_COLORS[s] : '#0D2761' }}>
              {fmt(row.projectedYE, formatType)}
            </p>
          </div>
        )}
        {row.requiredMonthly !== null && (
          <div>
            <p className="text-[10px] text-[#6B7280] mb-0.5">Required / month</p>
            <p className="text-sm font-semibold text-[#0D2761]">{fmt(row.requiredMonthly, formatType)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function PerformanceVsTarget({ filters }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.productLine) params.set('productLine', filters.productLine);
    if (filters.uwYear) params.set('uwYear', filters.uwYear);

    setLoading(true);
    fetch(`/api/dashboard/executive/performance-vs-target?${params}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [filters.productLine, filters.uwYear]);

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-[#F4F6FA] rounded-xl animate-pulse" />)}</div>;
  if (error) return <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-5 py-4 text-sm text-[#991B1B]">{error}</div>;
  if (!data) return null;

  if (!data.hasTargets) {
    return (
      <div className="rounded-xl border border-[#E8EEF8] bg-[#F4F6FA] px-6 py-10 text-center">
        <p className="text-sm font-semibold text-[#0D2761] mb-1">No targets configured</p>
        <p className="text-xs text-[#6B7280]">Set annual targets in Settings → Targets to see performance tracking.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricBlock label="Loss Ratio" row={data.lossRatio} formatType="pct" />
        <MetricBlock label="Net Written Premium" row={data.netWp} formatType="rand" />
        <MetricBlock label="Policy Count" row={data.policyCount} formatType="int" />
      </div>

      {data.byProductLine.length > 0 && (
        <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#E8EEF8]">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">By product line</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#F4F6FA]">
              <tr>
                {['Product line','Loss ratio','Target','NWP','Claims'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.byProductLine.map(pl => (
                <tr key={pl.productLine} className="border-t border-[#E8EEF8] hover:bg-[#F4F6FA]/50">
                  <td className="px-4 py-2.5 text-xs font-medium text-[#0D2761]">{pl.productLine}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[pl.status]}`} />
                      <span className="text-xs font-semibold" style={{ color: STATUS_COLORS[pl.status] }}>
                        {fmt(pl.lossRatioActual, 'pct')}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[#6B7280]">{fmt(pl.lossRatioTarget, 'pct')}</td>
                  <td className="px-4 py-2.5 text-xs text-[#0D2761]">{fmt(pl.netWp, 'rand')}</td>
                  <td className="px-4 py-2.5 text-xs text-[#0D2761]">{pl.claimCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
