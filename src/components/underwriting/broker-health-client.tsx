'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';

interface LossRatio {
  value: number;
  approximate: boolean;
}

interface BrokerRow {
  broker: string;
  gwp: number;
  netWp: number;
  grossComm: number;
  grossCommPct: number | null;
  lossRatio: LossRatio | null;
}

type SortKey = 'gwp' | 'netWp' | 'lossRatio';
type SortDir = 'asc' | 'desc';

function formatRand(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `R ${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `R ${(value / 1_000).toFixed(0)}K`;
  return `R ${value.toLocaleString('en-ZA')}`;
}

export function BrokerHealthClient() {
  const [data, setData] = useState<BrokerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('gwp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    fetch('/api/underwriting/brokers')
      .then(r => {
        if (!r.ok) throw new Error(`Failed: ${r.status}`);
        return r.json() as Promise<BrokerRow[]>;
      })
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...data].sort((a, b) => {
    let aVal = 0;
    let bVal = 0;
    if (sortKey === 'gwp') { aVal = a.gwp; bVal = b.gwp; }
    if (sortKey === 'netWp') { aVal = a.netWp; bVal = b.netWp; }
    if (sortKey === 'lossRatio') { aVal = a.lossRatio?.value ?? 0; bVal = b.lossRatio?.value ?? 0; }
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 inline ml-1" strokeWidth={2} />
      : <ArrowDown className="w-3 h-3 inline ml-1" strokeWidth={2} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0D2761]">Broker Health</h1>
        <p className="text-sm text-[#6B7280]">Broker performance and loss ratio analysis</p>
      </div>

      {/* Placeholder banner */}
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
        <AlertTriangle className="w-5 h-5 text-[#F5A800] flex-shrink-0" strokeWidth={2} />
        <span className="text-sm text-amber-800">
          <strong>Broker data</strong> is sourced from the Revenue Analysis report.
          Full UW analysis requires additional reports.
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-[#6B7280] text-sm">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-[#6B7280] text-sm">No broker data available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#6B7280] border-b border-[#E8EEF8] bg-[#F4F6FA]">
                  <th className="text-left px-4 py-3 font-medium">Broker</th>
                  <th
                    className="text-right px-4 py-3 font-medium cursor-pointer hover:text-[#0D2761] select-none"
                    onClick={() => handleSort('gwp')}
                  >
                    GWP <SortIcon k="gwp" />
                  </th>
                  <th
                    className="text-right px-4 py-3 font-medium cursor-pointer hover:text-[#0D2761] select-none"
                    onClick={() => handleSort('netWp')}
                  >
                    Net WP <SortIcon k="netWp" />
                  </th>
                  <th className="text-right px-4 py-3 font-medium">Gross Comm %</th>
                  <th
                    className="text-right px-4 py-3 font-medium cursor-pointer hover:text-[#0D2761] select-none"
                    onClick={() => handleSort('lossRatio')}
                  >
                    Loss Ratio <SortIcon k="lossRatio" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(row => (
                  <tr key={row.broker} className="border-b border-[#E8EEF8] hover:bg-[#F4F6FA] transition-colors">
                    <td className="px-4 py-2.5 text-[#0D2761] font-medium max-w-[200px] truncate">{row.broker}</td>
                    <td className="px-4 py-2.5 text-right text-[#0D2761]">{formatRand(row.gwp)}</td>
                    <td className="px-4 py-2.5 text-right text-[#6B7280]">{formatRand(row.netWp)}</td>
                    <td className="px-4 py-2.5 text-right text-[#6B7280]">
                      {row.grossCommPct !== null ? `${row.grossCommPct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {row.lossRatio !== null ? (
                        <span className={row.lossRatio.value > 65 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                          {row.lossRatio.value.toFixed(1)}%
                          {row.lossRatio.approximate && (
                            <span className="ml-1 text-[10px] text-[#6B7280] font-normal">(limited data)</span>
                          )}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
