'use client';

import { useState, useEffect } from 'react';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { formatZAR, formatDate } from '@/lib/utils';

interface DeltaStats {
  newClaims: number;
  statusChanges: number;
  valueJumps: number;
  finalised: number;
}

interface HandlerRow {
  handler: string;
  openClaims: number;
  avgOutstanding: number;
  tatBreaches: number;
  finalisedThisMonth: number;
}

interface ReserveFlag {
  claimId: string;
  handler: string | null;
  reserveUtilisationPct: number;
  severity: 'warning' | 'critical';
}

interface HocData {
  totalOpenClaims: number;
  totalIncurred: number;
  totalOutstanding: number;
  tatBreachCount: number;
  bigClaimsCount: number;
  deltaStats: DeltaStats;
  handlerScorecard: HandlerRow[];
  reserveFlags: ReserveFlag[];
  snapshotDate: string | null;
}

type SortKey = keyof HandlerRow;

export function HocDashboard() {
  const [data, setData] = useState<HocData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('openClaims');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/dashboard/hoc')
      .then(r => r.json())
      .then((d: HocData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-sm text-[#6B7280]">Loading dashboard...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
        <p className="text-sm text-[#6B7280]">Failed to load dashboard data.</p>
      </div>
    );
  }

  const criticalBreaches = data.tatBreachCount > 0;

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sortedHandlers = [...data.handlerScorecard].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">Head of Claims Dashboard</h1>
        {data.snapshotDate && (
          <p className="text-sm text-[#6B7280] mt-1">
            Snapshot: {formatDate(data.snapshotDate)}
          </p>
        )}
      </div>

      {/* Alert strip */}
      {criticalBreaches && (
        <div className="mb-6 flex items-center justify-between gap-4 px-4 py-3 bg-[#991B1B]/5 border border-[#991B1B]/30 rounded-xl">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#991B1B] opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#991B1B]" />
            </span>
            <p className="text-sm font-semibold text-[#991B1B]">
              {data.tatBreachCount} claim{data.tatBreachCount !== 1 ? 's' : ''} currently breaching TAT
            </p>
          </div>
          <a
            href="/tat"
            className="text-xs font-medium text-[#991B1B] hover:underline flex-shrink-0"
          >
            View TAT Watchlist →
          </a>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard
          label="Total Open Claims"
          value={data.totalOpenClaims.toLocaleString()}
          variant="default"
        />
        <StatCard
          label="Total Incurred"
          value={formatZAR(data.totalIncurred, 0)}
          variant="default"
        />
        <StatCard
          label="Total Outstanding"
          value={formatZAR(data.totalOutstanding, 0)}
          variant="default"
        />
        <StatCard
          label="TAT Breaches"
          value={data.tatBreachCount}
          variant={data.tatBreachCount > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Big Claims"
          value={data.bigClaimsCount}
          variant={data.bigClaimsCount > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Delta summary */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-[#0D2761] mb-3 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-[#F5A800] inline-block" />Today's Changes</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'New Claims', value: data.deltaStats.newClaims, variant: 'info' as const },
            { label: 'Status Changes', value: data.deltaStats.statusChanges, variant: 'warning' as const },
            { label: 'Value Jumps', value: data.deltaStats.valueJumps, variant: 'danger' as const },
            { label: 'Finalised', value: data.deltaStats.finalised, variant: 'success' as const },
          ].map(item => (
            <div
              key={item.label}
              className="bg-white border border-[#E8EEF8] rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] text-center"
            >
              <p className="text-2xl font-semibold text-[#0D2761] tabular-nums">{item.value}</p>
              <p className="text-xs text-[#6B7280] mt-1">
                <Badge variant={item.variant}>{item.label}</Badge>
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Handler scorecards table */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-[#0D2761] mb-3 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-[#F5A800] inline-block" />Handler Scorecard</h2>
        <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                  {([
                    ['handler', 'Handler'],
                    ['openClaims', 'Open Claims'],
                    ['avgOutstanding', 'Avg Outstanding'],
                    ['tatBreaches', 'TAT Breaches'],
                    ['finalisedThisMonth', 'Finalised'],
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-[#0D2761] select-none"
                    >
                      <div className="flex items-center gap-1">
                        {label}
                        {sortKey === key && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            {sortDir === 'asc' ? (
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            )}
                          </svg>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedHandlers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#6B7280]">
                      No handler data available.
                    </td>
                  </tr>
                ) : (
                  sortedHandlers.map((handler, idx) => (
                    <tr
                      key={handler.handler}
                      className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/50' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-[#0D2761]">{handler.handler}</td>
                      <td className="px-4 py-3 tabular-nums text-[#0D2761]">{handler.openClaims}</td>
                      <td className="px-4 py-3 tabular-nums text-[#0D2761]">{formatZAR(handler.avgOutstanding)}</td>
                      <td className="px-4 py-3">
                        {handler.tatBreaches > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#991B1B]/10 text-[#991B1B]">
                            {handler.tatBreaches}
                          </span>
                        ) : (
                          <span className="text-[#6B7280] text-sm">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[#6B7280]">{handler.finalisedThisMonth}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Reserve flags */}
      {data.reserveFlags.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-[#0D2761] mb-3 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-[#F5A800] inline-block" />Reserve Utilisation Flags</h2>
          <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            {data.reserveFlags.map((flag, idx) => (
              <div
                key={flag.claimId}
                className={`flex items-center justify-between gap-4 px-4 py-3 ${
                  idx < data.reserveFlags.length - 1 ? 'border-b border-[#E8EEF8]' : ''
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <a
                    href={`/claims/${encodeURIComponent(flag.claimId)}`}
                    className="font-mono text-sm font-medium text-[#0D2761] hover:underline flex-shrink-0"
                  >
                    {flag.claimId}
                  </a>
                  <span className="text-sm text-[#6B7280] truncate">{flag.handler ?? 'Unassigned'}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-sm font-semibold tabular-nums ${
                    flag.severity === 'critical' ? 'text-[#991B1B]' : 'text-[#92400E]'
                  }`}>
                    {flag.reserveUtilisationPct.toFixed(1)}%
                  </span>
                  <Badge variant={flag.severity === 'critical' ? 'danger' : 'warning'}>
                    {flag.severity === 'critical' ? 'Critical' : 'Warning'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
