'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, LineChart, Line, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from 'recharts';
import { formatZAR, formatDate } from '@/lib/utils';
import type { HandlerMetrics, PortfolioCategory } from '@/lib/compute/productivity';
import { PRODUCTIVITY_BENCHMARKS } from '@/lib/compute/productivity';
import { TargetAchievementView } from './target-achievement-view';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssessorClaim {
  claimId: string;
  handler: string;
  claimStatus: string | null;
  daysInCurrentStatus: number;
  totalOs: number;
  cause: string | null;
}

interface TeamKpis {
  totalOpen: number;
  prevTotalOpen: number | null;
  avgFinalisationRate: number;
  prevAvgFinalisationRate: number | null;
  avgPaymentRate: number;
  prevAvgPaymentRate: number | null;
  newRegistrations: number;
  finalisedToday: number;
  totalReserve: number;
  prevTotalReserve: number | null;
  totalZeroActivity: number;
  prevTotalZeroActivity: number | null;
}

interface TrendPoint {
  date: string;
  handlers: Array<{ handler: string; open: number; newClaims: number; finalised: number }>;
}

interface ProductivityData {
  handlers: HandlerMetrics[];
  prevHandlers: HandlerMetrics[];
  snapshotDate: string | null;
  prevSnapshotDate: string | null;
  assessorPipeline: AssessorClaim[];
  teamKpis: TeamKpis | null;
  trend: TrendPoint[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  navy: '#0D2761',
  blue: '#1E5BC6',
  blueLight: '#EFF4FF',
  amber: '#F5A800',
  amberLight: '#FFF9EC',
  green: '#065F46',
  greenLight: '#ECFDF5',
  red: '#991B1B',
  redLight: '#FEF2F2',
  orange: '#92400E',
  gray: '#6B7280',
  border: '#E8EEF8',
  bg: '#F4F6FA',
};

const HANDLER_COLORS = [
  '#1E5BC6', '#059669', '#D97706', '#7C3AED', '#DB2777',
  '#0891B2', '#65A30D', '#DC2626', '#9333EA', '#0D9488',
];

const CATEGORY_LABELS: Record<PortfolioCategory, string> = {
  glass: 'Glass', theft: 'Theft / Hijack', complex: 'Complex',
};

const PIE_COLORS: Record<string, string> = {
  Glass: '#059669',
  'Theft / Hijack': '#991B1B',
  Complex: '#1E5BC6',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortName(name: string) {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function delta(curr: number, prev: number | null | undefined, lowerIsBetter = false) {
  if (prev === null || prev === undefined) return null;
  const diff = curr - prev;
  if (diff === 0) return { diff: 0, direction: 'flat' as const, positive: true };
  const positive = lowerIsBetter ? diff < 0 : diff > 0;
  return { diff, direction: diff < 0 ? 'down' as const : 'up' as const, positive };
}

function perfColor(value: number, benchmark: number, inverted: boolean) {
  const ratio = inverted
    ? benchmark / (value || 0.01)
    : value / (benchmark || 1);
  if (ratio >= 1) return C.green;
  if (ratio >= 0.8) return C.amber;
  return C.red;
}

function DeltaBadge({ curr, prev, lowerIsBetter, unit = '' }: {
  curr: number; prev: number | null | undefined; lowerIsBetter?: boolean; unit?: string;
}) {
  const d = delta(curr, prev, lowerIsBetter);
  if (!d) return null;
  const arrow = d.direction === 'flat' ? '→' : d.direction === 'up' ? '↑' : '↓';
  const color = d.positive ? C.green : C.red;
  const bg = d.positive ? C.greenLight : C.redLight;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums"
      style={{ color, background: bg }}
    >
      {arrow} {Math.abs(d.diff).toFixed(unit === '%' ? 1 : 0)}{unit}
    </span>
  );
}

// ─── Team KPI Strip ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, prev, lowerIsBetter, format }: {
  label: string;
  value: number;
  sub?: string;
  prev?: number | null;
  lowerIsBetter?: boolean;
  format?: 'number' | 'pct' | 'zar';
}) {
  const fmt = (v: number) =>
    format === 'pct' ? `${v.toFixed(1)}%`
    : format === 'zar' ? formatZAR(v, 0)
    : v.toLocaleString();

  return (
    <div className="bg-white rounded-xl border p-4 flex flex-col gap-2" style={{ borderColor: C.border }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.gray }}>{label}</p>
      <div className="flex items-end gap-2">
        <p className="text-2xl font-bold tabular-nums" style={{ color: C.navy }}>{fmt(value)}</p>
        {prev !== undefined && (
          <div className="mb-0.5">
            <DeltaBadge curr={value} prev={prev} lowerIsBetter={lowerIsBetter}
              unit={format === 'pct' ? '%' : ''} />
          </div>
        )}
      </div>
      {sub && <p className="text-[11px]" style={{ color: C.gray }}>{sub}</p>}
    </div>
  );
}

// ─── Handler Comparison Bar Charts ───────────────────────────────────────────

interface BarDatum {
  name: string;
  fullName: string;
  value: number;
  benchmark: number;
  color: string;
}

function ComparisonBar({ title, data, unit = '%', inverted = false }: {
  title: string; data: BarDatum[]; unit?: string; inverted?: boolean;
}) {
  const maxVal = Math.max(...data.map(d => d.value), ...data.map(d => d.benchmark)) * 1.15;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as BarDatum;
    return (
      <div className="bg-white border rounded-lg shadow-lg px-3 py-2" style={{ borderColor: C.border }}>
        <p className="text-xs font-semibold" style={{ color: C.navy }}>{d.fullName}</p>
        <p className="text-xs tabular-nums mt-1" style={{ color: C.blue }}>
          {d.value.toFixed(1)}{unit}
          <span className="ml-1 font-normal" style={{ color: C.gray }}>
            (bench: {d.benchmark}{unit})
          </span>
        </p>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border p-4" style={{ borderColor: C.border }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: C.gray }}>{title}</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="35%">
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: C.gray }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, maxVal]}
            tick={{ fontSize: 9, fill: C.gray }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `${v}${unit}`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: C.bg }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
          {/* Benchmark reference line — use average since benchmarks differ per handler */}
          <ReferenceLine
            y={data.reduce((s, d) => s + d.benchmark, 0) / (data.length || 1)}
            stroke={C.amber}
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[10px] mt-1" style={{ color: C.amber }}>
        — avg benchmark
      </p>
    </div>
  );
}

// ─── Portfolio Donut ──────────────────────────────────────────────────────────

function PortfolioDonut({ metrics }: { metrics: HandlerMetrics }) {
  // Reconstruct category breakdown from benchmark category info
  // We only have dominantCategory, so we show the overall composition pill
  const cats = [
    { name: 'Glass', value: metrics.dominantCategory === 'glass' ? metrics.openClaims : 0 },
    { name: 'Theft / Hijack', value: metrics.dominantCategory === 'theft' ? metrics.openClaims : 0 },
    { name: 'Complex', value: metrics.dominantCategory === 'complex' ? metrics.openClaims : 0 },
  ].filter(c => c.value > 0);

  // Fallback: show single slice with dominant category
  const pieData = cats.length > 0 ? cats : [{ name: CATEGORY_LABELS[metrics.dominantCategory], value: 1 }];

  return (
    <div className="bg-white rounded-xl border p-4 flex flex-col items-center" style={{ borderColor: C.border }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-3 self-start" style={{ color: C.gray }}>
        Portfolio Mix
      </p>
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={42}
            outerRadius={62}
            paddingAngle={3}
            dataKey="value"
          >
            {pieData.map((entry, i) => (
              <Cell key={i} fill={PIE_COLORS[entry.name] ?? HANDLER_COLORS[i % HANDLER_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: unknown) => [`${v} claims`, '']}
            contentStyle={{ fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5 w-full mt-1">
        {pieData.map((d, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ background: PIE_COLORS[d.name] ?? HANDLER_COLORS[i % HANDLER_COLORS.length] }}
              />
              <span className="text-[11px]" style={{ color: C.gray }}>{d.name}</span>
            </div>
            <span className="text-[11px] font-semibold tabular-nums" style={{ color: C.navy }}>{d.value}</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t pt-1.5 mt-0.5" style={{ borderColor: C.border }}>
          <span className="text-[11px] font-semibold" style={{ color: C.navy }}>Total open</span>
          <span className="text-[11px] font-bold tabular-nums" style={{ color: C.navy }}>{metrics.openClaims}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: C.gray }}>Reserve</span>
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: C.navy }}>
            {formatZAR(metrics.openClaims * metrics.avgOsPerClaim, 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Metrics Radar ────────────────────────────────────────────────────────────

function MetricsRadar({ metrics }: { metrics: HandlerMetrics }) {
  const bm = metrics.benchmark;

  // Normalize all metrics to 0–120 scale where 100 = benchmark
  const norm = (v: number, b: number, inv: boolean) => {
    if (b === 0) return 100;
    const ratio = inv ? b / (v || 0.01) : v / b;
    return Math.min(Math.round(ratio * 100), 150);
  };

  const radarData = [
    {
      metric: 'Finalisation',
      score: norm(metrics.finalisationRate, bm.finalisationRate, false),
      benchmark: 100,
    },
    {
      metric: 'Payment Rate',
      score: norm(metrics.paymentRate, bm.paymentRate, false),
      benchmark: 100,
    },
    {
      metric: 'Activity',
      score: norm(metrics.zeroActivityPct, bm.zeroActivityPct, true),
      benchmark: 100,
    },
    {
      metric: 'Reserve Eff.',
      score: norm(metrics.avgOsPerClaim, bm.avgOsPerClaim, true),
      benchmark: 100,
    },
    {
      metric: 'Reopen Rate',
      score: norm(metrics.reopenRate, bm.reopenRate, true),
      benchmark: 100,
    },
  ];

  return (
    <div className="bg-white rounded-xl border p-4" style={{ borderColor: C.border }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: C.gray }}>
        Performance vs Benchmark
      </p>
      <p className="text-[10px] mb-2" style={{ color: C.gray }}>100 = benchmark · higher = better</p>
      <ResponsiveContainer width="100%" height={200}>
        <RadarChart data={radarData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke={C.border} />
          <PolarAngleAxis
            dataKey="metric"
            tick={{ fontSize: 9.5, fill: C.gray }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 130]}
            tick={{ fontSize: 8, fill: C.gray }}
            tickCount={4}
          />
          <Radar
            name="Benchmark"
            dataKey="benchmark"
            stroke={C.amber}
            fill={C.amber}
            fillOpacity={0.08}
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />
          <Radar
            name={shortName(metrics.handler)}
            dataKey="score"
            stroke={C.blue}
            fill={C.blue}
            fillOpacity={0.18}
            strokeWidth={2}
          />
          <Legend
            iconType="line"
            iconSize={12}
            wrapperStyle={{ fontSize: 10 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Handler KPI Tiles ────────────────────────────────────────────────────────

function HandlerKpiTiles({ metrics, prev }: { metrics: HandlerMetrics; prev: HandlerMetrics | null }) {
  const tiles = [
    {
      label: 'Open Claims',
      value: metrics.openClaims,
      prev: prev?.openClaims ?? null,
      lowerIsBetter: false,
      fmt: (v: number) => v.toLocaleString(),
    },
    {
      label: 'Finalisation Rate',
      value: metrics.finalisationRate,
      prev: prev?.finalisationRate ?? null,
      lowerIsBetter: false,
      benchmark: metrics.benchmark.finalisationRate,
      fmt: (v: number) => `${v.toFixed(1)}%`,
    },
    {
      label: 'Payment Rate',
      value: metrics.paymentRate,
      prev: prev?.paymentRate ?? null,
      lowerIsBetter: false,
      benchmark: metrics.benchmark.paymentRate,
      fmt: (v: number) => `${v.toFixed(1)}%`,
    },
    {
      label: 'Zero Activity',
      value: metrics.zeroActivityPct,
      prev: prev?.zeroActivityPct ?? null,
      lowerIsBetter: true,
      benchmark: metrics.benchmark.zeroActivityPct,
      fmt: (v: number) => `${v.toFixed(1)}%`,
    },
    {
      label: 'Avg Outstanding',
      value: metrics.avgOsPerClaim,
      prev: prev?.avgOsPerClaim ?? null,
      lowerIsBetter: true,
      benchmark: metrics.benchmark.avgOsPerClaim,
      fmt: (v: number) => formatZAR(v, 0),
    },
    {
      label: 'Complexity Score',
      value: metrics.complexityScore,
      prev: prev?.complexityScore ?? null,
      lowerIsBetter: false,
      fmt: (v: number) => v.toLocaleString(),
    },
  ];

  return (
    <div className="bg-white rounded-xl border p-4" style={{ borderColor: C.border }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: C.gray }}>
        Key Metrics
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map(t => {
          const color = t.benchmark !== undefined
            ? perfColor(t.value, t.benchmark, t.lowerIsBetter)
            : C.navy;
          return (
            <div
              key={t.label}
              className="rounded-lg px-3 py-2.5"
              style={{ background: C.bg }}
            >
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.gray }}>{t.label}</p>
              <p className="text-lg font-bold tabular-nums leading-none" style={{ color }}>{t.fmt(t.value)}</p>
              <div className="mt-1">
                <DeltaBadge
                  curr={t.value}
                  prev={t.prev}
                  lowerIsBetter={t.lowerIsBetter}
                  unit={t.label.includes('Rate') || t.label.includes('Activity') ? '%' : ''}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Trend Lines ──────────────────────────────────────────────────────────────

function TrendLines({ trend, handlers, selectedHandler }: {
  trend: TrendPoint[];
  handlers: HandlerMetrics[];
  selectedHandler: string;
}) {
  const [metric, setMetric] = useState<'open' | 'newClaims' | 'finalised'>('open');

  // Build flat chart data: one object per date with each handler as a key
  const chartData = trend.map(pt => {
    const obj: Record<string, string | number> = {
      date: pt.date.slice(5), // "MM-DD"
    };
    for (const h of pt.handlers) {
      obj[h.handler] = metric === 'open' ? h.open
        : metric === 'newClaims' ? h.newClaims
        : h.finalised;
    }
    return obj;
  });

  const handlerNames = handlers.map(h => h.handler);

  const metricLabels = {
    open: 'Open Claims',
    newClaims: 'New Registrations',
    finalised: 'Finalised',
  };

  return (
    <div className="bg-white rounded-xl border p-4" style={{ borderColor: C.border }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.gray }}>
          {metricLabels[metric]} — Last {trend.length} Snapshots
        </p>
        <div className="flex items-center gap-1">
          {(['open', 'newClaims', 'finalised'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
              style={{
                background: metric === m ? C.navy : C.bg,
                color: metric === m ? '#fff' : C.gray,
              }}
            >
              {metricLabels[m]}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.gray }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: C.gray }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 8 }}
            labelStyle={{ color: C.navy, fontWeight: 600 }}
          />
          {handlerNames.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={HANDLER_COLORS[i % HANDLER_COLORS.length]}
              strokeWidth={name === selectedHandler ? 2.5 : 1.5}
              strokeOpacity={selectedHandler === 'all' || name === selectedHandler ? 1 : 0.3}
              dot={false}
              activeDot={{ r: 3 }}
              name={shortName(name)}
            />
          ))}
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
            formatter={(value) => shortName(String(value))}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Intelligence Dashboard ───────────────────────────────────────────────────

function IntelligenceDashboard({ data }: { data: ProductivityData }) {
  const { handlers, prevHandlers, teamKpis, trend } = data;
  const [selectedHandler, setSelectedHandler] = useState<string>(handlers[0]?.handler ?? '');

  const prevMap = useMemo(() => new Map(prevHandlers.map(h => [h.handler, h])), [prevHandlers]);

  const selMetrics = handlers.find(h => h.handler === selectedHandler) ?? handlers[0];
  const selPrev = selMetrics ? (prevMap.get(selMetrics.handler) ?? null) : null;

  // Build bar chart data for each comparison metric
  function buildBarData(
    key: keyof HandlerMetrics,
    bmKey: keyof typeof PRODUCTIVITY_BENCHMARKS.complex,
    inverted: boolean,
  ): BarDatum[] {
    return handlers.map(h => {
      const value = h[key] as number;
      const bm = h.benchmark[bmKey] as number;
      const color = perfColor(value, bm, inverted);
      return {
        name: shortName(h.handler).split(' ')[0],
        fullName: h.handler,
        value: Math.round(value * 10) / 10,
        benchmark: bm,
        color: h.handler === selectedHandler ? C.navy : color,
      };
    });
  }

  if (!teamKpis) {
    return <p className="text-sm" style={{ color: C.gray }}>No data available.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Team KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Open Claims"
          value={teamKpis.totalOpen}
          prev={teamKpis.prevTotalOpen}
          lowerIsBetter={false}
          sub="across all handlers"
        />
        <KpiCard
          label="New Today"
          value={teamKpis.newRegistrations}
          sub="registered this upload"
          format="number"
        />
        <KpiCard
          label="Finalised Today"
          value={teamKpis.finalisedToday}
          sub="closed this upload"
          format="number"
        />
        <KpiCard
          label="Avg Final. Rate"
          value={teamKpis.avgFinalisationRate}
          prev={teamKpis.prevAvgFinalisationRate}
          sub="team average"
          format="pct"
        />
        <KpiCard
          label="Avg Payment Rate"
          value={teamKpis.avgPaymentRate}
          prev={teamKpis.prevAvgPaymentRate}
          sub="team average"
          format="pct"
        />
        <KpiCard
          label="Total Reserve"
          value={teamKpis.totalReserve}
          prev={teamKpis.prevTotalReserve}
          lowerIsBetter={true}
          sub="open book"
          format="zar"
        />
      </div>

      {/* Handler selector */}
      <div className="flex items-center gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide flex-shrink-0" style={{ color: C.gray }}>
          Focus handler:
        </p>
        <div className="flex flex-wrap gap-2">
          {handlers.map((h, i) => (
            <button
              key={h.handler}
              onClick={() => setSelectedHandler(h.handler)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
              style={{
                background: selectedHandler === h.handler ? C.navy : C.bg,
                color: selectedHandler === h.handler ? '#fff' : C.navy,
                borderColor: selectedHandler === h.handler ? C.navy : C.border,
              }}
            >
              {shortName(h.handler)}
            </button>
          ))}
        </div>
      </div>

      {/* Comparison bar charts */}
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: C.navy }}>
          Team Performance Comparison
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ComparisonBar
            title="Finalisation Rate %"
            data={buildBarData('finalisationRate', 'finalisationRate', false)}
          />
          <ComparisonBar
            title="Payment Rate %"
            data={buildBarData('paymentRate', 'paymentRate', false)}
          />
          <ComparisonBar
            title="Zero Activity % (lower = better)"
            data={buildBarData('zeroActivityPct', 'zeroActivityPct', true)}
          />
        </div>
      </div>

      {/* Zero activity + complexity side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ComparisonBar
          title="Avg Outstanding / Claim (ZAR)"
          data={handlers.map(h => ({
            name: shortName(h.handler).split(' ')[0],
            fullName: h.handler,
            value: Math.round(h.avgOsPerClaim),
            benchmark: h.benchmark.avgOsPerClaim,
            color: h.handler === selectedHandler
              ? C.navy
              : perfColor(h.avgOsPerClaim, h.benchmark.avgOsPerClaim, true),
          }))}
          unit=" R"
          inverted
        />
        <ComparisonBar
          title="Complexity Score (weighted portfolio)"
          data={handlers.map((h, i) => ({
            name: shortName(h.handler).split(' ')[0],
            fullName: h.handler,
            value: h.complexityScore,
            benchmark: 0,
            color: h.handler === selectedHandler ? C.navy : HANDLER_COLORS[i % HANDLER_COLORS.length],
          }))}
          unit=""
        />
      </div>

      {/* Handler deep-dive */}
      {selMetrics && (
        <div>
          <h3 className="text-sm font-semibold mb-3" style={{ color: C.navy }}>
            {shortName(selMetrics.handler)} — Deep Dive
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <PortfolioDonut metrics={selMetrics} />
            <MetricsRadar metrics={selMetrics} />
            <HandlerKpiTiles metrics={selMetrics} prev={selPrev} />
          </div>
        </div>
      )}

      {/* Trend lines */}
      {trend.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold mb-3" style={{ color: C.navy }}>
            Activity Trends
          </h3>
          <TrendLines trend={trend} handlers={handlers} selectedHandler={selectedHandler} />
        </div>
      )}

      {/* Zero activity alert */}
      {teamKpis.totalZeroActivity > 0 && (
        <div
          className="rounded-xl border px-4 py-3 flex items-center gap-3"
          style={{ background: '#FFF9EC', borderColor: C.amber }}
        >
          <span className="text-lg">⚠</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: C.orange }}>
              {teamKpis.totalZeroActivity} claims with zero activity (7+ days, no movement)
            </p>
            <p className="text-xs mt-0.5" style={{ color: C.orange }}>
              These are breached claims with no status changes — consider follow-up action.
              {teamKpis.prevTotalZeroActivity !== null && (
                <span className="ml-1">
                  Previously: {teamKpis.prevTotalZeroActivity}
                </span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scorecard View (retained) ────────────────────────────────────────────────

const CATEGORY_COLORS: Record<PortfolioCategory, string> = {
  glass: 'text-[#065F46]',
  theft: 'text-[#991B1B]',
  complex: 'text-[#0D2761]',
};

function BenchmarkBar({ label, value, benchmark, unit = '%', inverted = false }: {
  label: string; value: number; benchmark: number; unit?: string; inverted?: boolean;
}) {
  const onTarget = inverted ? value <= benchmark : value >= benchmark;
  const pct = benchmark > 0 ? Math.min((value / benchmark) * 100, 100) : 0;
  const barPct = inverted
    ? benchmark > 0 ? Math.min((value / benchmark) * 100, 100) : 0
    : Math.min(pct, 100);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#6B7280]">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold tabular-nums ${onTarget ? 'text-[#065F46]' : 'text-[#92400E]'}`}>
            {unit === 'ZAR' ? formatZAR(value, 0) : `${value.toFixed(1)}${unit}`}
          </span>
          <span className="text-xs text-[#E8EEF8]">/</span>
          <span className="text-xs text-[#6B7280] tabular-nums">
            {unit === 'ZAR' ? formatZAR(benchmark, 0) : `${benchmark}${unit}`}
          </span>
        </div>
      </div>
      <div className="h-1.5 bg-[#F4F6FA] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${onTarget ? 'bg-[#065F46]' : 'bg-[#92400E]'}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  );
}

function HandlerScoreCard({ metrics }: { metrics: HandlerMetrics }) {
  const [expanded, setExpanded] = useState(false);
  const overallScore = Math.round(
    (metrics.scores.finalisationScore + metrics.scores.paymentScore +
      metrics.scores.zeroActivityScore + metrics.scores.avgOsScore +
      metrics.scores.reopenScore) / 5,
  );
  const scoreColor = overallScore >= 100
    ? 'text-[#065F46] bg-[#065F46]/8'
    : overallScore >= 70
    ? 'text-[#92400E] bg-[#92400E]/8'
    : 'text-[#991B1B] bg-[#991B1B]/8';

  return (
    <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div
        className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer hover:bg-[#F4F6FA]/60 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#0D2761]/8 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-[#0D2761]">
              {metrics.handler.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0D2761] truncate">{metrics.handler}</p>
            <p className={`text-xs ${CATEGORY_COLORS[metrics.dominantCategory]}`}>
              {CATEGORY_LABELS[metrics.dominantCategory]} portfolio
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 flex-shrink-0">
          <div className="text-center">
            <p className="text-lg font-semibold text-[#0D2761] tabular-nums">{metrics.openClaims}</p>
            <p className="text-xs text-[#6B7280]">Open</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-[#0D2761] tabular-nums">{metrics.complexityScore}</p>
            <p className="text-xs text-[#6B7280]">Complexity</p>
          </div>
          <div className={`px-2.5 py-1 rounded-lg text-sm font-semibold tabular-nums ${scoreColor}`}>
            {overallScore}%
          </div>
          <svg
            className={`w-4 h-4 text-[#6B7280] flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-5 border-t border-[#F4F6FA]">
          <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid grid-cols-2 gap-3 sm:col-span-2">
              {[
                { label: 'Total Portfolio', value: metrics.totalClaims },
                { label: 'Open', value: metrics.openClaims },
                { label: 'Finalised', value: metrics.finalisedCount },
                { label: 'Avg Outstanding', value: formatZAR(metrics.avgOsPerClaim, 0) },
              ].map(item => (
                <div key={item.label} className="bg-[#F4F6FA] rounded-lg px-3 py-2.5">
                  <p className="text-xs text-[#6B7280]">{item.label}</p>
                  <p className="text-base font-semibold text-[#0D2761] tabular-nums mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="sm:col-span-2 space-y-3">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                vs {CATEGORY_LABELS[metrics.dominantCategory]} Benchmark
              </p>
              <BenchmarkBar label="Finalisation Rate" value={metrics.finalisationRate} benchmark={metrics.benchmark.finalisationRate} />
              <BenchmarkBar label="Payment Rate" value={metrics.paymentRate} benchmark={metrics.benchmark.paymentRate} />
              <BenchmarkBar label="Zero Activity %" value={metrics.zeroActivityPct} benchmark={metrics.benchmark.zeroActivityPct} inverted />
              <BenchmarkBar label="Avg O/S per Claim" value={metrics.avgOsPerClaim} benchmark={metrics.benchmark.avgOsPerClaim} unit="ZAR" inverted />
              <BenchmarkBar label="Reopen Rate" value={metrics.reopenRate} benchmark={metrics.benchmark.reopenRate} inverted />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type ViewKey = 'intelligence' | 'scorecards' | 'table' | 'assessors' | 'targets';

export function ProductivityClient() {
  const [data, setData] = useState<ProductivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewKey>('intelligence');
  const [sortCol, setSortCol] = useState<keyof HandlerMetrics>('complexityScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/productivity')
      .then(r => r.json())
      .then((d: ProductivityData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse bg-[#E8EEF8] rounded-xl h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
        <p className="text-sm text-[#6B7280]">Failed to load productivity data.</p>
      </div>
    );
  }

  const handlers = data.handlers;

  function toggleSort(col: keyof HandlerMetrics) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const sortedHandlers = [...handlers].sort((a, b) => {
    const av = a[sortCol] as number | string;
    const bv = b[sortCol] as number | string;
    if (typeof av === 'string' && typeof bv === 'string')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc'
      ? (av as number) - (bv as number)
      : (bv as number) - (av as number);
  });

  const TABLE_COLS: [keyof HandlerMetrics, string][] = [
    ['handler', 'Handler'],
    ['openClaims', 'Open'],
    ['complexityScore', 'Complexity'],
    ['finalisationRate', 'Final. Rate'],
    ['paymentRate', 'Pmt Rate'],
    ['zeroActivityPct', 'Zero Activity'],
    ['avgOsPerClaim', 'Avg O/S'],
    ['reopenRate', 'Reopen Rate'],
  ];

  const tabs: [ViewKey, string][] = [
    ['intelligence', 'Intelligence'],
    ['scorecards', 'Scorecards'],
    ['table', 'Team Table'],
    ['assessors', `Assessors (${data.assessorPipeline.length})`],
    ['targets', 'Targets'],
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">Productivity</h1>
        {data.snapshotDate && (
          <p className="text-sm text-[#6B7280] mt-1">
            Latest snapshot: {formatDate(data.snapshotDate)}
            {data.prevSnapshotDate && (
              <span className="ml-2 text-[#9CA3AF]">
                · comparing vs {formatDate(data.prevSnapshotDate)}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-[#F4F6FA] border border-[#E8EEF8] rounded-lg p-1 w-fit overflow-x-auto">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              view === key
                ? 'bg-white text-[#0D2761] shadow-sm border border-[#E8EEF8]'
                : 'text-[#6B7280] hover:text-[#0D2761]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Intelligence view */}
      {view === 'intelligence' && (
        handlers.length === 0 ? (
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
            <p className="text-sm text-[#6B7280]">No handler data in the latest snapshot.</p>
          </div>
        ) : (
          <IntelligenceDashboard data={data} />
        )
      )}

      {/* Scorecard view */}
      {view === 'scorecards' && (
        <div className="space-y-3">
          {handlers.length === 0 ? (
            <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
              <p className="text-sm text-[#6B7280]">No handler data in the latest snapshot.</p>
            </div>
          ) : handlers.map(m => <HandlerScoreCard key={m.handler} metrics={m} />)}
        </div>
      )}

      {/* Table view */}
      {view === 'table' && (
        <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                  {TABLE_COLS.map(([col, label]) => (
                    <th
                      key={col}
                      onClick={() => toggleSort(col)}
                      className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-[#0D2761] select-none"
                    >
                      <span className="flex items-center gap-1">
                        {label}
                        {sortCol === col && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            {sortDir === 'asc'
                              ? <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                              : <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />}
                          </svg>
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Category</th>
                </tr>
              </thead>
              <tbody>
                {sortedHandlers.length === 0 ? (
                  <tr>
                    <td colSpan={TABLE_COLS.length + 1} className="px-4 py-8 text-center text-sm text-[#6B7280]">No data available.</td>
                  </tr>
                ) : sortedHandlers.map((m, idx) => {
                  const fOk = m.finalisationRate >= m.benchmark.finalisationRate;
                  const pOk = m.paymentRate >= m.benchmark.paymentRate;
                  const zOk = m.zeroActivityPct <= m.benchmark.zeroActivityPct;
                  return (
                    <tr key={m.handler} className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/40' : ''}`}>
                      <td className="px-4 py-3 font-medium text-[#0D2761]">{m.handler}</td>
                      <td className="px-4 py-3 tabular-nums">{m.openClaims}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-[#0D2761]">{m.complexityScore}</td>
                      <td className={`px-4 py-3 tabular-nums ${fOk ? 'text-[#065F46]' : 'text-[#92400E]'}`}>{m.finalisationRate.toFixed(1)}%</td>
                      <td className={`px-4 py-3 tabular-nums ${pOk ? 'text-[#065F46]' : 'text-[#92400E]'}`}>{m.paymentRate.toFixed(1)}%</td>
                      <td className={`px-4 py-3 tabular-nums ${zOk ? 'text-[#065F46]' : 'text-[#92400E]'}`}>{m.zeroActivityPct.toFixed(1)}%</td>
                      <td className="px-4 py-3 tabular-nums text-[#6B7280]">{formatZAR(m.avgOsPerClaim, 0)}</td>
                      <td className={`px-4 py-3 tabular-nums ${m.reopenRate <= m.benchmark.reopenRate ? 'text-[#065F46]' : 'text-[#92400E]'}`}>{m.reopenRate.toFixed(1)}%</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${CATEGORY_COLORS[m.dominantCategory]}`}>
                          {CATEGORY_LABELS[m.dominantCategory]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Targets view */}
      {view === 'targets' && <TargetAchievementView />}

      {/* Assessors view */}
      {view === 'assessors' && (
        <div>
          <p className="text-sm text-[#6B7280] mb-4">
            Claims currently in <strong className="text-[#0D2761]">Assessor Appointed</strong> stage, ordered by days waiting.
          </p>
          {data.assessorPipeline.length === 0 ? (
            <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
              <p className="text-sm text-[#6B7280]">No claims currently with assessors.</p>
            </div>
          ) : (
            <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                      {['Claim', 'Handler', 'Cause', 'Days Waiting', 'Outstanding', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.assessorPipeline.map((c, idx) => (
                      <tr key={c.claimId} className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/40' : ''}`}>
                        <td className="px-4 py-3">
                          <a href={`/claims/${encodeURIComponent(c.claimId)}`} className="font-mono text-sm font-medium text-[#0D2761] hover:underline">
                            {c.claimId}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-[#6B7280]">{c.handler}</td>
                        <td className="px-4 py-3 text-[#6B7280]">{c.cause ?? '—'}</td>
                        <td className="px-4 py-3 tabular-nums">
                          <span className={`font-semibold ${c.daysInCurrentStatus > 3 ? 'text-[#991B1B]' : 'text-[#0D2761]'}`}>
                            {c.daysInCurrentStatus}
                          </span>
                          <span className="text-[#6B7280] ml-1">days</span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[#6B7280]">{formatZAR(c.totalOs, 0)}</td>
                        <td className="px-4 py-3 text-[#6B7280]">{c.claimStatus ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
