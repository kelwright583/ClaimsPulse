'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '@/components/dashboard/types';

interface MyWorkSubViewProps {
  role: UserRole;
  userId: string;
  filters: FilterState;
  handlerName: string;
  onHandlerChange: (name: string) => void;
}

interface LeaderboardRow {
  rank: number;
  handler: string;
  portfolioType: string | null;
  finalisationGlass: number | null;
  finalisationComplex: number | null;
  paymentRate: number | null;
  workloadScore: number | null;
  csScore: number | null;
  trend: 'up' | 'flat' | 'down';
}

interface SelectedMetrics {
  handler: string;
  finalisationGlass: number | null;
  finalisationComplex: number | null;
  paymentRate: number | null;
  activePortfolioRatio: number | null;
  workloadScore: number | null;
  capacity: number | null;
  avgOutstandingPerClaim: number | null;
  reopenRate: number | null;
  benchmarks: {
    glassTarget: number;
    complexTarget: number;
    teamAvgGlass: number | null;
    teamAvgComplex: number | null;
  };
}

interface WorkloadPoint {
  handler: string;
  score: number;
  capacity: number;
}

interface ProductivityData {
  leaderboard: LeaderboardRow[];
  selectedMetrics: SelectedMetrics | null;
  workloadChart: WorkloadPoint[];
  handlers?: string[];
}

function pct(val: number | null): string {
  if (val === null) return '—';
  return `${val.toFixed(1)}%`;
}

function HandlerSelector({
  role,
  handlers,
  selected,
  onHandlerChange,
}: {
  role: UserRole;
  handlers: string[];
  selected: string;
  onHandlerChange: (name: string) => void;
}) {
  const showAllOption =
    role === 'TEAM_LEADER' || role === 'HEAD_OF_CLAIMS' || role === 'SENIOR_MANAGEMENT';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#6B7280] font-medium">Viewing:</span>
      <select
        value={selected}
        onChange={(e) => onHandlerChange(e.target.value)}
        className="text-sm border border-[#E8EEF8] rounded-md px-2 py-1 text-[#0D2761] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
      >
        {showAllOption && <option value="__all__">All handlers</option>}
        {handlers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}

function TrendIcon({ trend }: { trend: 'up' | 'flat' | 'down' }) {
  if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-500" strokeWidth={2} />;
  if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-500" strokeWidth={2} />;
  return <Minus className="w-4 h-4 text-[#6B7280]" strokeWidth={2} />;
}

function TargetIndicator({
  value,
  target,
  label,
}: {
  value: number | null;
  target: number;
  label: string;
}) {
  if (value === null) return <span className="text-xs text-[#6B7280]">—</span>;
  const diff = value - target;
  const color = diff >= 0 ? 'text-green-600' : 'text-red-500';
  const arrow = diff >= 0 ? '↑' : '↓';
  return (
    <span className="text-xs">
      <span className="text-[#0D2761]">{pct(value)}</span>{' '}
      <span className={`${color} font-medium`}>
        {arrow}{Math.abs(diff).toFixed(1)}% vs {label}
      </span>
    </span>
  );
}

const leaderboardHelper = createColumnHelper<LeaderboardRow>();

export default function ProductivityScores({
  role,
  handlerName,
  onHandlerChange,
}: MyWorkSubViewProps) {
  const [data, setData] = useState<ProductivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  const fetchData = useCallback(
    (signal: AbortSignal) => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ handler: handlerName });
      fetch(`/api/dashboard/my-work/productivity-scores?${params}`, { signal })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<ProductivityData>;
        })
        .then((json) => {
          setData(json);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          setError(err instanceof Error ? err.message : 'Failed to load');
          setLoading(false);
        });
    },
    [handlerName],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const columns = useMemo(
    () => [
      leaderboardHelper.accessor('rank', {
        header: '#',
        cell: (info) => (
          <span className="text-xs font-bold text-[#0D2761]">{info.getValue()}</span>
        ),
      }),
      leaderboardHelper.accessor('handler', {
        header: 'Handler',
        cell: (info) => (
          <span className="text-sm font-medium text-[#0D2761]">{info.getValue()}</span>
        ),
      }),
      leaderboardHelper.accessor('portfolioType', {
        header: 'Portfolio',
        cell: (info) => (
          <span className="text-xs text-[#6B7280]">{info.getValue() ?? '—'}</span>
        ),
      }),
      leaderboardHelper.accessor('finalisationGlass', {
        header: 'Glass fin.',
        cell: (info) => (
          <TargetIndicator value={info.getValue()} target={75} label="75%" />
        ),
      }),
      leaderboardHelper.accessor('finalisationComplex', {
        header: 'Complex fin.',
        cell: (info) => (
          <TargetIndicator value={info.getValue()} target={35} label="35%" />
        ),
      }),
      leaderboardHelper.accessor('paymentRate', {
        header: 'Payment rate',
        cell: (info) => (
          <span className="text-xs text-[#6B7280]">{pct(info.getValue())}</span>
        ),
      }),
      leaderboardHelper.accessor('workloadScore', {
        header: 'Workload',
        cell: (info) => (
          <span className="text-xs text-[#6B7280]">
            {info.getValue() !== null ? info.getValue() : '—'}
          </span>
        ),
      }),
      leaderboardHelper.accessor('csScore', {
        header: 'CS score',
        cell: (info) => (
          <span className="text-xs text-[#0D2761] font-medium">
            {info.getValue() !== null ? `${info.getValue()}/100` : '—'}
          </span>
        ),
      }),
      leaderboardHelper.accessor('trend', {
        header: 'Trend',
        cell: (info) => <TrendIcon trend={info.getValue()} />,
        enableSorting: false,
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: data?.leaderboard ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (loading) {
    return <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />;
  }

  if (error || !data) {
    return (
      <div className="text-sm text-red-500 p-4">{error ?? 'No data available.'}</div>
    );
  }

  const handlers = data.handlers ?? [];
  const sm = data.selectedMetrics;
  const capacity = sm?.capacity ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold tracking-widest text-[#0D2761] uppercase">
          Productivity scores
        </h2>
        <HandlerSelector
          role={role}
          handlers={handlers}
          selected={handlerName}
          onHandlerChange={onHandlerChange}
        />
      </div>

      {/* Leaderboard table */}
      <div className="overflow-x-auto rounded-lg border border-[#E8EEF8]">
        <table className="w-full text-left">
          <thead className="bg-[#F8FAFF]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2.5 text-xs font-semibold text-[#0D2761] uppercase tracking-wider whitespace-nowrap cursor-pointer select-none"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-[#E8EEF8]">
            {table.getRowModel().rows.map((row) => {
              const isOwn = row.original.handler === handlerName;
              return (
                <tr
                  key={row.id}
                  className={`bg-white hover:bg-[#F8FAFF] transition-colors ${
                    isOwn ? 'border-l-[3px] border-l-[#F5A800]' : ''
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Metric cards */}
      {sm === null ? (
        <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MetricCard
            title="Glass finalisation"
            value={pct(sm.finalisationGlass)}
            target={`Target: ${sm.benchmarks.glassTarget}%`}
            teamAvg={
              sm.benchmarks.teamAvgGlass !== null
                ? `Team avg: ${pct(sm.benchmarks.teamAvgGlass)}`
                : null
            }
            above={
              sm.finalisationGlass !== null &&
              sm.finalisationGlass >= sm.benchmarks.glassTarget
            }
          />
          <MetricCard
            title="Complex finalisation"
            value={pct(sm.finalisationComplex)}
            target={`Target: ${sm.benchmarks.complexTarget}%`}
            teamAvg={
              sm.benchmarks.teamAvgComplex !== null
                ? `Team avg: ${pct(sm.benchmarks.teamAvgComplex)}`
                : null
            }
            above={
              sm.finalisationComplex !== null &&
              sm.finalisationComplex >= sm.benchmarks.complexTarget
            }
          />
          <MetricCard
            title="Payment rate"
            value={pct(sm.paymentRate)}
            target={null}
            teamAvg={null}
            above={null}
          />
          <MetricCard
            title="Active portfolio ratio"
            value={pct(sm.activePortfolioRatio)}
            target={null}
            teamAvg={null}
            above={null}
          />
          <MetricCard
            title="Workload score"
            value={
              sm.workloadScore !== null
                ? `${sm.workloadScore}${capacity !== null ? ` / ${capacity}` : ''}`
                : '—'
            }
            target={capacity !== null ? `Capacity: ${capacity}` : null}
            teamAvg={null}
            above={
              sm.workloadScore !== null && capacity !== null
                ? sm.workloadScore <= capacity
                : null
            }
          />
          <MetricCard
            title="Re-open rate"
            value={pct(sm.reopenRate)}
            target={null}
            teamAvg={null}
            above={sm.reopenRate !== null ? sm.reopenRate <= 5 : null}
          />
        </div>
      )}

      {/* Workload bar chart */}
      {data.workloadChart.length > 0 && (
        <div>
          <h3 className="text-xs font-bold tracking-widest text-[#0D2761] uppercase mb-3">
            Workload vs capacity
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(180, data.workloadChart.length * 36)}>
            <BarChart
              data={data.workloadChart}
              layout="vertical"
              margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
            >
              <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7280' }} />
              <YAxis
                dataKey="handler"
                type="category"
                width={120}
                tick={{ fontSize: 11, fill: '#0D2761' }}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderColor: '#E8EEF8' }}
                formatter={(value: unknown) => [`${value}`, 'Score'] as [string, string]}
              />
              {data.workloadChart.length > 0 && (
                <ReferenceLine
                  x={data.workloadChart[0].capacity}
                  stroke="#0D2761"
                  strokeDasharray="4 2"
                  label={{ value: 'Capacity', position: 'insideTopRight', fontSize: 10, fill: '#0D2761' }}
                />
              )}
              <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                {data.workloadChart.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.score > entry.capacity ? '#F5A800' : '#1E5BC6'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  target,
  teamAvg,
  above,
}: {
  title: string;
  value: string;
  target: string | null;
  teamAvg: string | null;
  above: boolean | null;
}) {
  const valueColor =
    above === null
      ? 'text-[#0D2761]'
      : above
      ? 'text-green-600'
      : 'text-red-500';

  return (
    <div className="bg-white border border-[#E8EEF8] rounded-lg p-4">
      <p className="text-xs text-[#6B7280] font-medium mb-1">{title}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {target && <span className="text-xs text-[#6B7280]">{target}</span>}
        {teamAvg && <span className="text-xs text-[#6B7280]">{teamAvg}</span>}
      </div>
    </div>
  );
}
