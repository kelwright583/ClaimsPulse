'use client';

import { useState, useEffect } from 'react';
import { StatCard } from '@/components/ui/stat-card';
import { formatZAR, formatDate } from '@/lib/utils';
import type { HandlerMetrics } from '@/lib/compute/productivity';

interface ApprovalItem {
  claimId: string;
  handler: string;
  daysInCurrentStatus: number;
  totalOs: number;
}

interface EscalationItem {
  claimId: string;
  handler: string;
  daysInCurrentStatus: number;
  totalIncurred: number;
}

interface EnrichedHandlerMetrics extends HandlerMetrics {
  slaBreaches: number;
}

interface TeamLeaderData {
  totalOpenClaims: number;
  slaBreachCount: number;
  finalisedToday: number;
  pendingApprovals: ApprovalItem[];
  escalations: EscalationItem[];
  handlerMetrics: EnrichedHandlerMetrics[];
  snapshotDate: string | null;
}

type HandlerSortKey = 'handler' | 'openClaims' | 'slaBreaches' | 'complexityScore' | 'finalisationRate';

export function TeamLeaderDashboard() {
  const [data, setData] = useState<TeamLeaderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<HandlerSortKey>('openClaims');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/dashboard/team-leader')
      .then(r => r.json())
      .then((d: TeamLeaderData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#6B7280]">Loading team dashboard…</p>
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

  function toggleSort(key: HandlerSortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  const sortedHandlers = [...data.handlerMetrics].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'string' && typeof bv === 'string')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc'
      ? (av as number) - (bv as number)
      : (bv as number) - (av as number);
  });

  const SortIcon = ({ col }: { col: HandlerSortKey }) =>
    sortKey !== col ? null : (
      <svg className="w-3 h-3 ml-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        {sortDir === 'asc' ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        )}
      </svg>
    );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">Team Leader Dashboard</h1>
        {data.snapshotDate && (
          <p className="text-sm text-[#6B7280] mt-1">Snapshot: {formatDate(data.snapshotDate)}</p>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Team Open Claims"
          value={data.totalOpenClaims.toLocaleString()}
          variant="default"
        />
        <StatCard
          label="SLA Breaches"
          value={data.slaBreachCount}
          variant={data.slaBreachCount > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Finalised Today"
          value={data.finalisedToday}
          variant={data.finalisedToday > 0 ? 'success' : 'default'}
        />
      </div>

      {/* Alert: pending approvals */}
      {data.pendingApprovals.length > 0 && (
        <div className="mb-6 px-4 py-3 bg-[#92400E]/5 border border-[#92400E]/30 rounded-xl">
          <p className="text-sm font-semibold text-[#92400E] mb-2">
            {data.pendingApprovals.length} claim{data.pendingApprovals.length !== 1 ? 's' : ''} pending management authorisation
          </p>
          <div className="space-y-1">
            {data.pendingApprovals.slice(0, 5).map(item => (
              <div key={item.claimId} className="flex items-center gap-4 text-sm">
                <a
                  href={`/claims/${encodeURIComponent(item.claimId)}`}
                  className="font-mono font-medium text-[#0D2761] hover:underline"
                >
                  {item.claimId}
                </a>
                <span className="text-[#6B7280]">{item.handler}</span>
                <span className="text-[#92400E] font-medium">{item.daysInCurrentStatus} days</span>
                <span className="text-[#6B7280]">{formatZAR(item.totalOs, 0)}</span>
              </div>
            ))}
            {data.pendingApprovals.length > 5 && (
              <p className="text-xs text-[#6B7280] pt-1">
                +{data.pendingApprovals.length - 5} more — <a href="/sla" className="text-[#0D2761] hover:underline">view SLA watchlist</a>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Alert: escalations */}
      {data.escalations.length > 0 && (
        <div className="mb-6 px-4 py-3 bg-[#991B1B]/5 border border-[#991B1B]/30 rounded-xl">
          <p className="text-sm font-semibold text-[#991B1B] mb-2">
            {data.escalations.length} claim{data.escalations.length !== 1 ? 's' : ''} escalated to management
          </p>
          <div className="space-y-1">
            {data.escalations.slice(0, 5).map(item => (
              <div key={item.claimId} className="flex items-center gap-4 text-sm">
                <a
                  href={`/claims/${encodeURIComponent(item.claimId)}`}
                  className="font-mono font-medium text-[#0D2761] hover:underline"
                >
                  {item.claimId}
                </a>
                <span className="text-[#6B7280]">{item.handler}</span>
                <span className="text-[#991B1B] font-medium">{item.daysInCurrentStatus} days</span>
                <span className="text-[#6B7280]">{formatZAR(item.totalIncurred, 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Handler performance table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-[#0D2761] flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-[#F5A800] inline-block" />Handler Performance</h2>
          <a href="/productivity" className="text-xs font-medium text-[#0D2761] hover:underline">
            Full Productivity View →
          </a>
        </div>
        <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                  {(
                    [
                      ['handler', 'Handler'],
                      ['openClaims', 'Open'],
                      ['complexityScore', 'Complexity'],
                      ['finalisationRate', 'Final. Rate'],
                      ['slaBreaches', 'SLA Breaches'],
                    ] as [HandlerSortKey, string][]
                  ).map(([col, label]) => (
                    <th
                      key={col}
                      onClick={() => toggleSort(col)}
                      className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-[#0D2761] select-none"
                    >
                      {label}
                      <SortIcon col={col} />
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                    Avg O/S
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedHandlers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#6B7280]">
                      No handler data available.
                    </td>
                  </tr>
                ) : (
                  sortedHandlers.map((m, idx) => (
                    <tr
                      key={m.handler}
                      className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/40' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-[#0D2761]">{m.handler}</td>
                      <td className="px-4 py-3 tabular-nums">{m.openClaims}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-[#0D2761]">
                        {m.complexityScore}
                      </td>
                      <td className={`px-4 py-3 tabular-nums ${m.finalisationRate >= m.benchmark.finalisationRate ? 'text-[#065F46]' : 'text-[#92400E]'}`}>
                        {m.finalisationRate.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3">
                        {m.slaBreaches > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#991B1B]/10 text-[#991B1B]">
                            {m.slaBreaches}
                          </span>
                        ) : (
                          <span className="text-[#6B7280]">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[#6B7280]">
                        {formatZAR(m.avgOsPerClaim, 0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
