'use client';

import { useState, useEffect } from 'react';
import { formatZAR, formatDate } from '@/lib/utils';
import type { HandlerMetrics, PortfolioCategory } from '@/lib/compute/productivity';

interface AssessorClaim {
  claimId: string;
  handler: string;
  claimStatus: string | null;
  daysInCurrentStatus: number;
  totalOs: number;
  cause: string | null;
}

interface ProductivityData {
  handlers: HandlerMetrics[];
  snapshotDate: string | null;
  assessorPipeline: AssessorClaim[];
}

const CATEGORY_LABELS: Record<PortfolioCategory, string> = {
  glass: 'Glass',
  theft: 'Theft/Hijack',
  complex: 'Complex',
};

const CATEGORY_COLORS: Record<PortfolioCategory, string> = {
  glass: 'text-[#065F46]',
  theft: 'text-[#991B1B]',
  complex: 'text-[#0D2761]',
};

function BenchmarkBar({
  label,
  value,
  benchmark,
  unit = '%',
  inverted = false,
}: {
  label: string;
  value: number;
  benchmark: number;
  unit?: string;
  inverted?: boolean;
}) {
  // For normal metrics (higher = better): green if >= benchmark
  // For inverted metrics (lower = better): green if <= benchmark
  const pct = benchmark > 0 ? Math.min((value / benchmark) * 100, 200) : 0;
  const onTarget = inverted ? value <= benchmark : value >= benchmark;
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

function HandlerCard({ metrics }: { metrics: HandlerMetrics }) {
  const [expanded, setExpanded] = useState(false);

  const overallScore = Math.round(
    (metrics.scores.finalisationScore +
      metrics.scores.paymentScore +
      metrics.scores.zeroActivityScore +
      metrics.scores.avgOsScore +
      metrics.scores.reopenScore) /
      5,
  );

  const scoreColor =
    overallScore >= 100
      ? 'text-[#065F46] bg-[#065F46]/8'
      : overallScore >= 70
      ? 'text-[#92400E] bg-[#92400E]/8'
      : 'text-[#991B1B] bg-[#991B1B]/8';

  return (
    <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      {/* Header */}
      <div
        className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer hover:bg-[#F4F6FA]/60 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#0D2761]/8 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-[#0D2761]">
              {metrics.handler
                .split(' ')
                .map(n => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
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
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>

      {/* Expanded metrics */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-[#F4F6FA]">
          <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 sm:col-span-2">
              {[
                { label: 'Total Portfolio', value: metrics.totalClaims },
                { label: 'Open', value: metrics.openClaims },
                { label: 'Finalised', value: metrics.finalisedCount },
                { label: 'Avg Outstanding', value: formatZAR(metrics.avgOsPerClaim, 0) },
              ].map(item => (
                <div key={item.label} className="bg-[#F4F6FA] rounded-lg px-3 py-2.5">
                  <p className="text-xs text-[#6B7280]">{item.label}</p>
                  <p className="text-base font-semibold text-[#0D2761] tabular-nums mt-0.5">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Benchmark bars */}
            <div className="sm:col-span-2 space-y-3">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                vs {CATEGORY_LABELS[metrics.dominantCategory]} Benchmark
              </p>
              <BenchmarkBar
                label="Finalisation Rate"
                value={metrics.finalisationRate}
                benchmark={metrics.benchmark.finalisationRate}
              />
              <BenchmarkBar
                label="Payment Rate"
                value={metrics.paymentRate}
                benchmark={metrics.benchmark.paymentRate}
              />
              <BenchmarkBar
                label="Zero Activity %"
                value={metrics.zeroActivityPct}
                benchmark={metrics.benchmark.zeroActivityPct}
                inverted
              />
              <BenchmarkBar
                label="Avg O/S per Claim"
                value={metrics.avgOsPerClaim}
                benchmark={metrics.benchmark.avgOsPerClaim}
                unit="ZAR"
                inverted
              />
              <BenchmarkBar
                label="Reopen Rate"
                value={metrics.reopenRate}
                benchmark={metrics.benchmark.reopenRate}
                inverted
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProductivityClient() {
  const [data, setData] = useState<ProductivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'scorecards' | 'table' | 'assessors'>('scorecards');
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
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#6B7280]">Loading productivity data…</p>
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
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">Productivity</h1>
        {data.snapshotDate && (
          <p className="text-sm text-[#6B7280] mt-1">
            Snapshot: {formatDate(data.snapshotDate)}
          </p>
        )}
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 mb-6 bg-[#F4F6FA] border border-[#E8EEF8] rounded-lg p-1 w-fit">
        {([
          ['scorecards', 'Handler Scorecards'],
          ['table', 'Team Table'],
          ['assessors', `Assessor Pipeline (${data.assessorPipeline.length})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === key
                ? 'bg-white text-[#0D2761] shadow-sm border border-[#E8EEF8]'
                : 'text-[#6B7280] hover:text-[#0D2761]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Scorecard view */}
      {view === 'scorecards' && (
        <div className="space-y-3">
          {handlers.length === 0 ? (
            <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
              <p className="text-sm text-[#6B7280]">No handler data in the latest snapshot.</p>
            </div>
          ) : (
            handlers.map(m => <HandlerCard key={m.handler} metrics={m} />)
          )}
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
                            {sortDir === 'asc' ? (
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            )}
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
                    <td colSpan={TABLE_COLS.length + 1} className="px-4 py-8 text-center text-sm text-[#6B7280]">
                      No data available.
                    </td>
                  </tr>
                ) : (
                  sortedHandlers.map((m, idx) => {
                    const fOnTarget = m.finalisationRate >= m.benchmark.finalisationRate;
                    const pOnTarget = m.paymentRate >= m.benchmark.paymentRate;
                    const zOnTarget = m.zeroActivityPct <= m.benchmark.zeroActivityPct;
                    return (
                      <tr
                        key={m.handler}
                        className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/40' : ''}`}
                      >
                        <td className="px-4 py-3 font-medium text-[#0D2761]">{m.handler}</td>
                        <td className="px-4 py-3 tabular-nums">{m.openClaims}</td>
                        <td className="px-4 py-3 tabular-nums font-semibold text-[#0D2761]">{m.complexityScore}</td>
                        <td className={`px-4 py-3 tabular-nums ${fOnTarget ? 'text-[#065F46]' : 'text-[#92400E]'}`}>
                          {m.finalisationRate.toFixed(1)}%
                        </td>
                        <td className={`px-4 py-3 tabular-nums ${pOnTarget ? 'text-[#065F46]' : 'text-[#92400E]'}`}>
                          {m.paymentRate.toFixed(1)}%
                        </td>
                        <td className={`px-4 py-3 tabular-nums ${zOnTarget ? 'text-[#065F46]' : 'text-[#92400E]'}`}>
                          {m.zeroActivityPct.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[#6B7280]">{formatZAR(m.avgOsPerClaim, 0)}</td>
                        <td className={`px-4 py-3 tabular-nums ${m.reopenRate <= m.benchmark.reopenRate ? 'text-[#065F46]' : 'text-[#92400E]'}`}>
                          {m.reopenRate.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${CATEGORY_COLORS[m.dominantCategory]}`}>
                            {CATEGORY_LABELS[m.dominantCategory]}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assessor pipeline */}
      {view === 'assessors' && (
        <div>
          <div className="mb-4">
            <p className="text-sm text-[#6B7280]">
              Claims currently in <strong className="text-[#0D2761]">Assessor Appointed</strong> stage, ordered by days waiting.
            </p>
          </div>
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
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.assessorPipeline.map((c, idx) => (
                      <tr
                        key={c.claimId}
                        className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/40' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <a
                            href={`/claims/${encodeURIComponent(c.claimId)}`}
                            className="font-mono text-sm font-medium text-[#0D2761] hover:underline"
                          >
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
