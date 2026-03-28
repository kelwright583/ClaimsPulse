'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '@/components/dashboard/types';

interface GeographicPerilData {
  byArea: Array<{ area: string; count: number; historicalAvg: number | null; isSpike: boolean }>;
  heatmap: Array<{ area: string; cause: string; count: number }>;
  clusteringAlerts: Array<{ area: string; cause: string; count: number; multiplier: number; days: number }>;
  claims: Array<{
    claimId: string;
    area: string | null;
    cause: string | null;
    handler: string | null;
    claimStatus: string | null;
    totalIncurred: number | null;
  }>;
}

interface SubViewProps {
  role: UserRole;
  userId: string;
  filters: FilterState;
}

function formatZAR(value: number | null) {
  if (value === null) return '—';
  return 'R ' + value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

type ClaimRow = GeographicPerilData['claims'][number];
const colHelper = createColumnHelper<ClaimRow>();

const EMPTY = 'No data yet — import a Claims Outstanding report to populate the dashboard.';

function heatmapCellStyle(count: number, avgForArea: number | null): { bg: string; text: string } {
  if (count === 0) return { bg: 'bg-white', text: 'text-[#6B7280]' };
  if (avgForArea !== null && count > avgForArea * 2) return { bg: 'bg-[#FECACA]', text: 'text-[#991B1B]' };
  // Intensity based on count — map to blue opacity
  if (count >= 20) return { bg: 'bg-[#1E5BC6]', text: 'text-white' };
  if (count >= 10) return { bg: 'bg-[#BFDBFE]', text: 'text-[#1E3A8A]' };
  if (count >= 5) return { bg: 'bg-[#DBEAFE]', text: 'text-[#1E3A8A]' };
  return { bg: 'bg-[#EFF6FF]', text: 'text-[#1E40AF]' };
}

export function GeographicPeril({ userId: _userId, filters }: SubViewProps) {
  const [data, setData] = useState<GeographicPerilData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    const keys = Object.keys(filters) as (keyof FilterState)[];
    for (const k of keys) {
      const v = filters[k] as string;
      if (v) params.set(k, v);
    }
    fetch(`/api/dashboard/claims/geographic-peril?${params}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then((json: GeographicPerilData | null) => { if (json) setData(json); })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [filters]);

  const heatmapAreas = useMemo(() => {
    const s = new Set((data?.heatmap ?? []).map(r => r.area));
    return Array.from(s);
  }, [data]);

  const heatmapCauses = useMemo(() => {
    const s = new Set((data?.heatmap ?? []).map(r => r.cause));
    return Array.from(s);
  }, [data]);

  const heatmapMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of data?.heatmap ?? []) {
      m[`${r.area}||${r.cause}`] = r.count;
    }
    return m;
  }, [data]);

  // Area avg from byArea for spike coloring
  const areaAvgMap = useMemo(() => {
    const m: Record<string, number | null> = {};
    for (const r of data?.byArea ?? []) {
      m[r.area] = r.historicalAvg;
    }
    return m;
  }, [data]);

  const filteredClaims = useMemo(() => {
    if (!data) return [];
    if (!selectedArea) return data.claims;
    return data.claims.filter(c => c.area === selectedArea);
  }, [data, selectedArea]);

  const columns = useMemo(() => [
    colHelper.accessor('claimId', {
      header: 'Claim ID',
      cell: i => (
        <Link href={`/claims/${encodeURIComponent(i.getValue())}`} className="font-mono text-[#1E5BC6] text-xs hover:underline">
          {i.getValue()}
        </Link>
      ),
    }),
    colHelper.accessor('area', {
      header: 'Area',
      cell: i => <span className="text-sm text-[#0D2761]">{i.getValue() ?? '—'}</span>,
    }),
    colHelper.accessor('cause', {
      header: 'Cause',
      cell: i => <span className="text-sm text-[#6B7280]">{i.getValue() ?? '—'}</span>,
    }),
    colHelper.accessor('handler', {
      header: 'Handler',
      cell: i => <span className="text-sm text-[#0D2761]">{i.getValue() ?? '—'}</span>,
    }),
    colHelper.accessor('claimStatus', {
      header: 'Status',
      cell: i => <span className="text-sm text-[#0D2761]">{i.getValue() ?? '—'}</span>,
    }),
    colHelper.accessor('totalIncurred', {
      header: 'Total incurred',
      cell: i => <span className="text-sm tabular-nums">{formatZAR(i.getValue())}</span>,
    }),
  ], []);

  const table = useReactTable({
    data: filteredClaims,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />
        <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-[#6B7280]">{EMPTY}</p>;
  }

  const alerts = data.clusteringAlerts ?? [];
  const byArea = data.byArea ?? [];

  return (
    <div className="space-y-6">
      {/* Clustering alert banners */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-4 rounded-xl border-l-4 border-[#F5A800] bg-[#FFF9EC]"
            >
              <AlertTriangle className="w-4 h-4 text-[#92400E] flex-shrink-0 mt-0.5" strokeWidth={2} />
              <p className="text-sm text-[#92400E]">
                Unusual concentration detected — {alert.count} claims from{' '}
                <span className="font-semibold">{alert.area}</span> in last {alert.days} days —{' '}
                <span className="font-semibold">{alert.multiplier.toFixed(1)}x</span> the historical average.{' '}
                <button
                  onClick={() => setSelectedArea(alert.area)}
                  className="underline hover:no-underline font-medium ml-1"
                >
                  View these claims →
                </button>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Horizontal bar chart — areas by count */}
        <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4">
          <p className="text-sm font-semibold text-[#0D2761] mb-3">Claims by area</p>
          {byArea.length === 0 ? (
            <p className="text-xs text-[#6B7280]">{EMPTY}</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, byArea.length * 36)}>
              <BarChart
                data={byArea}
                layout="vertical"
                margin={{ left: 10, right: 20 }}
                onClick={(d: unknown) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const area = (d as any)?.activePayload?.[0]?.payload?.area as string | undefined;
                  if (area) setSelectedArea(area === selectedArea ? null : area);
                }}
              >
                <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7280' }} />
                <YAxis type="category" dataKey="area" width={130} tick={{ fontSize: 11, fill: '#0D2761' }} />
                <Tooltip cursor={{ fill: '#F4F6FA' }} />
                <Bar dataKey="count" radius={[0, 3, 3, 0]} cursor="pointer">
                  {byArea.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.area === selectedArea ? '#0D2761' : entry.isSpike ? '#F5A800' : '#1E5BC6'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {selectedArea && (
            <p className="text-xs text-[#6B7280] mt-2">
              Filtered to: <span className="font-semibold text-[#0D2761]">{selectedArea}</span>{' '}
              <button onClick={() => setSelectedArea(null)} className="text-[#1E5BC6] hover:underline ml-1">Clear</button>
            </p>
          )}
        </div>

        {/* Peril heatmap */}
        <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm p-4 overflow-x-auto">
          <p className="text-sm font-semibold text-[#0D2761] mb-3">Peril heatmap</p>
          {heatmapAreas.length === 0 ? (
            <p className="text-xs text-[#6B7280]">{EMPTY}</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">Area</th>
                  {heatmapCauses.map(cause => (
                    <th key={cause} className="px-2 py-1.5 text-center font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                      {cause}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapAreas.map(area => (
                  <tr key={area}>
                    <td className="px-2 py-1 font-medium text-[#0D2761] whitespace-nowrap">{area}</td>
                    {heatmapCauses.map(cause => {
                      const count = heatmapMap[`${area}||${cause}`] ?? 0;
                      const avgForArea = areaAvgMap[area] ?? null;
                      const { bg, text } = heatmapCellStyle(count, avgForArea);
                      return (
                        <td key={cause} className={`px-2 py-1 text-center ${bg} ${text} font-medium`}>
                          {count > 0 ? count : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Claims table */}
      <section>
        <h2 className="text-base font-semibold text-[#0D2761] mb-3">
          Claims{selectedArea ? ` — ${selectedArea}` : ' — all areas'}
        </h2>
        {filteredClaims.length === 0 ? (
          <p className="text-sm text-[#6B7280]">{EMPTY}</p>
        ) : (
          <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map(hg => (
                    <tr key={hg.id} className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                      {hg.headers.map(header => (
                        <th key={header.id} className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map(row => (
                    <tr key={row.id} className="border-b border-[#E8EEF8] last:border-0 hover:bg-[#F4F6FA] transition-colors">
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
