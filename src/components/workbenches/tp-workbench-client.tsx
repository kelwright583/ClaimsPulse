'use client';

import { useState, useEffect } from 'react';
import { StatCard } from '@/components/ui/stat-card';
import { formatZAR, formatDate } from '@/lib/utils';

interface TpClaim {
  claimId: string;
  handler: string;
  insured: string | null;
  broker: string | null;
  cause: string | null;
  claimStatus: string | null;
  daysInCurrentStatus: number;
  isSlaBreach: boolean;
  thirdPartyOs: number;
  thirdPartyPaid: number;
  tpLiabilityOs: number;
  tpLiabilityPaid: number;
  totalRecovery: number;
  totalOs: number;
  totalIncurred: number;
  dateOfLoss: string | null;
}

interface TpStats {
  total: number;
  totalTpOs: number;
  totalTpPaid: number;
  totalRecovery: number;
}

interface TpData {
  claims: TpClaim[];
  stats: TpStats;
  snapshotDate: string | null;
}

type SortKey = keyof TpClaim;

export function TpWorkbenchClient() {
  const [data, setData] = useState<TpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('daysInCurrentStatus');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/workbenches/tp')
      .then(r => r.json())
      .then((d: TpData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#6B7280]">Loading TP workbench…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
        <p className="text-sm text-[#6B7280]">Failed to load workbench data.</p>
      </div>
    );
  }

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(col); setSortDir('desc'); }
  }

  const filtered = data.claims.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.claimId.toLowerCase().includes(q) ||
      (c.insured ?? '').toLowerCase().includes(q) ||
      (c.handler ?? '').toLowerCase().includes(q) ||
      (c.broker ?? '').toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'boolean' && typeof bv === 'boolean') return sortDir === 'asc' ? +av - +bv : +bv - +av;
    if (typeof av === 'string' && typeof bv === 'string')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey !== col ? null : (
      <svg className="w-3 h-3 ml-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        {sortDir === 'asc'
          ? <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />}
      </svg>
    );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">TP Workbench</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Claims where own damage is finalised and third-party recovery is in progress
          {data.snapshotDate && ` · Snapshot: ${formatDate(data.snapshotDate)}`}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="TP Claims Open" value={data.stats.total} variant="default" />
        <StatCard label="Total TP Outstanding" value={formatZAR(data.stats.totalTpOs, 0)} variant="default" />
        <StatCard label="Total TP Paid" value={formatZAR(data.stats.totalTpPaid, 0)} variant="default" />
        <StatCard label="Total Recovery" value={formatZAR(data.stats.totalRecovery, 0)} variant="success" />
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by claim, insured, handler or broker…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm px-3 py-2 border border-[#E8EEF8] rounded-lg text-sm text-[#0D2761] focus:outline-none focus:border-[#0D2761] focus:ring-1 focus:ring-[#0D2761] bg-white"
        />
      </div>

      <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                {(
                  [
                    ['claimId', 'Claim'],
                    ['insured', 'Insured'],
                    ['handler', 'Handler'],
                    ['cause', 'Cause'],
                    ['daysInCurrentStatus', 'Days'],
                    ['thirdPartyOs', 'TP Outstanding'],
                    ['thirdPartyPaid', 'TP Paid'],
                    ['totalRecovery', 'Recovery'],
                  ] as [SortKey, string][]
                ).map(([col, label]) => (
                  <th
                    key={col}
                    onClick={() => toggleSort(col)}
                    className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-[#0D2761] select-none"
                  >
                    {label}<SortIcon col={col} />
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">SLA</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-[#6B7280]">
                    {data.claims.length === 0 ? 'No TP claims in the latest snapshot.' : 'No results match your search.'}
                  </td>
                </tr>
              ) : (
                sorted.map((c, idx) => (
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
                    <td className="px-4 py-3 text-[#0D2761] max-w-[160px] truncate">{c.insured ?? '—'}</td>
                    <td className="px-4 py-3 text-[#6B7280]">{c.handler}</td>
                    <td className="px-4 py-3 text-[#6B7280] max-w-[120px] truncate">{c.cause ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className={c.daysInCurrentStatus > 60 ? 'text-[#991B1B] font-semibold' : c.daysInCurrentStatus > 30 ? 'text-[#92400E]' : 'text-[#0D2761]'}>
                        {c.daysInCurrentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[#0D2761]">{formatZAR(c.thirdPartyOs + c.tpLiabilityOs, 0)}</td>
                    <td className="px-4 py-3 tabular-nums text-[#6B7280]">{formatZAR(c.thirdPartyPaid + c.tpLiabilityPaid, 0)}</td>
                    <td className="px-4 py-3 tabular-nums text-[#065F46]">{formatZAR(c.totalRecovery, 0)}</td>
                    <td className="px-4 py-3">
                      {c.isSlaBreach && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#991B1B]/10 text-[#991B1B]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#991B1B] animate-pulse" />
                          Breach
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {sorted.length > 0 && (
          <div className="px-4 py-3 border-t border-[#E8EEF8] bg-[#F4F6FA]/50 text-xs text-[#6B7280]">
            {filtered.length} claim{filtered.length !== 1 ? 's' : ''}
            {search && ` matching "${search}"`}
          </div>
        )}
      </div>
    </div>
  );
}
