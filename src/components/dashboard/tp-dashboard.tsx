'use client';

import { useState, useEffect } from 'react';
import { StatCard } from '@/components/ui/stat-card';
import { formatZAR, formatDate } from '@/lib/utils';

interface TpClaim {
  claimId: string;
  handler: string;
  insured: string | null;
  cause: string | null;
  claimStatus: string | null;
  daysInCurrentStatus: number;
  isTatBreach: boolean;
  thirdPartyOs: number;
  thirdPartyPaid: number;
  tpLiabilityOs: number;
  tpLiabilityPaid: number;
  totalRecovery: number;
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

export function TpDashboard() {
  const [data, setData] = useState<TpData | null>(null);
  const [loading, setLoading] = useState(true);

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

  const claims = data?.claims ?? [];
  const stats = data?.stats ?? { total: 0, totalTpOs: 0, totalTpPaid: 0, totalRecovery: 0 };
  const tatBreaches = claims.filter(c => c.isTatBreach);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">TP Handler Dashboard</h1>
        {data?.snapshotDate && (
          <p className="text-sm text-[#6B7280] mt-1">Snapshot: {formatDate(data.snapshotDate)}</p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="TP Claims Open" value={stats.total} variant="default" />
        <StatCard label="TP Outstanding" value={formatZAR(stats.totalTpOs, 0)} variant="default" />
        <StatCard label="TP Paid" value={formatZAR(stats.totalTpPaid, 0)} variant="default" />
        <StatCard label="Recovery" value={formatZAR(stats.totalRecovery, 0)} variant="success" />
      </div>

      {tatBreaches.length > 0 && (
        <div className="mb-6 px-4 py-3 bg-[#991B1B]/5 border border-[#991B1B]/30 rounded-xl">
          <p className="text-sm font-semibold text-[#991B1B] mb-2">
            {tatBreaches.length} TP claim{tatBreaches.length !== 1 ? 's' : ''} breaching TAT
          </p>
          <div className="space-y-1">
            {tatBreaches.slice(0, 5).map(c => (
              <div key={c.claimId} className="flex items-center gap-4 text-sm">
                <a href={`/claims/${encodeURIComponent(c.claimId)}`} className="font-mono font-medium text-[#0D2761] hover:underline">
                  {c.claimId}
                </a>
                <span className="text-[#6B7280]">{c.insured ?? '—'}</span>
                <span className="text-[#991B1B] font-medium">{c.daysInCurrentStatus} days</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-[#0D2761] flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-[#F5A800] inline-block" />TP Claims Queue</h2>
          <a href="/workbenches/tp" className="text-xs font-medium text-[#0D2761] hover:underline">
            Open Workbench →
          </a>
        </div>

        {claims.length === 0 ? (
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
            <p className="text-sm text-[#6B7280]">No TP claims in the latest snapshot.</p>
          </div>
        ) : (
          <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                    {['Claim', 'Insured', 'Cause', 'Days', 'TP Outstanding', 'TP Paid', 'Recovery'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {claims.slice(0, 50).map((c, idx) => (
                    <tr
                      key={c.claimId}
                      className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/40' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <a href={`/claims/${encodeURIComponent(c.claimId)}`} className="font-mono text-sm font-medium text-[#0D2761] hover:underline">
                          {c.claimId}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-[#0D2761] max-w-[140px] truncate">{c.insured ?? '—'}</td>
                      <td className="px-4 py-3 text-[#6B7280] max-w-[110px] truncate">{c.cause ?? '—'}</td>
                      <td className="px-4 py-3 tabular-nums">
                        <span className={c.daysInCurrentStatus > 60 ? 'text-[#991B1B] font-semibold' : 'text-[#0D2761]'}>
                          {c.daysInCurrentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[#0D2761]">{formatZAR(c.thirdPartyOs + c.tpLiabilityOs, 0)}</td>
                      <td className="px-4 py-3 tabular-nums text-[#6B7280]">{formatZAR(c.thirdPartyPaid + c.tpLiabilityPaid, 0)}</td>
                      <td className="px-4 py-3 tabular-nums text-[#065F46]">{formatZAR(c.totalRecovery, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {claims.length > 50 && (
              <div className="px-4 py-3 border-t border-[#E8EEF8] bg-[#F4F6FA]/50 text-xs text-[#6B7280]">
                Showing 50 of {claims.length} claims — <a href="/workbenches/tp" className="text-[#0D2761] hover:underline">view all</a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
