'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Legend,
} from 'recharts';

interface GwpByMonth {
  month: string;
  gwp: number;
  netWp: number;
}

interface EndorsementSplit {
  endorsementType: string;
  gwp: number;
}

interface TopProductLine {
  productLine: string;
  gwp: number;
}

interface ProductionData {
  gwpByMonth: GwpByMonth[];
  endorsementSplit: EndorsementSplit[];
  topProductLines: TopProductLine[];
}

function formatRand(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `R ${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `R ${(value / 1_000).toFixed(0)}K`;
  return `R ${value.toLocaleString('en-ZA')}`;
}

export function ProductionClient() {
  const [data, setData] = useState<ProductionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/underwriting/production')
      .then(r => {
        if (!r.ok) throw new Error(`Failed: ${r.status}`);
        return r.json() as Promise<ProductionData>;
      })
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0D2761]">Production</h1>
        <p className="text-sm text-[#6B7280]">Underwriting production analytics — last 6 months</p>
      </div>

      {/* Placeholder banner */}
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
        <AlertTriangle className="w-5 h-5 text-[#F5A800] flex-shrink-0" strokeWidth={2} />
        <span className="text-sm text-amber-800">
          <strong>Production data</strong> is sourced from the Revenue Analysis report.
          Full UW analysis requires additional reports.
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-[#6B7280] text-sm">Loading…</div>
      ) : data ? (
        <>
          {/* GWP by month — Composed bar + line */}
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-[#0D2761] mb-4">GWP & Net WP by Month</h2>
            {data.gwpByMonth.length === 0 ? (
              <div className="text-sm text-[#6B7280] text-center py-8">No data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={data.gwpByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis tickFormatter={v => formatRand(v as number)} tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <Tooltip formatter={(v) => formatRand(v as number)} />
                  <Legend />
                  <Bar dataKey="gwp" fill="#1E5BC6" name="GWP" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="netWp" stroke="#F5A800" strokeWidth={2} name="Net WP" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Endorsement split */}
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-[#0D2761] mb-4">Endorsement Split</h2>
            {data.endorsementSplit.length === 0 ? (
              <div className="text-sm text-[#6B7280] text-center py-8">No data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.endorsementSplit} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => formatRand(v as number)} tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis type="category" dataKey="endorsementType" tick={{ fontSize: 11, fill: '#6B7280' }} width={120} />
                  <Tooltip formatter={(v) => formatRand(v as number)} />
                  <Bar dataKey="gwp" fill="#1E5BC6" name="GWP" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top product lines */}
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-[#0D2761] mb-4">Top Product Lines by GWP</h2>
            {data.topProductLines.length === 0 ? (
              <div className="text-sm text-[#6B7280] text-center py-8">No data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.topProductLines} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => formatRand(v as number)} tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis type="category" dataKey="productLine" tick={{ fontSize: 11, fill: '#6B7280' }} width={140} />
                  <Tooltip formatter={(v) => formatRand(v as number)} />
                  <Bar dataKey="gwp" fill="#0D2761" name="GWP" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
