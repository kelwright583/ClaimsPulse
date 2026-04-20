'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatZAR, formatDate } from '@/lib/utils';

interface EnrichedFlag {
  id: string;
  claimId: string;
  flagType: string;
  severity: string;
  detail: string | null;
  createdAt: string;
  claim: {
    handler: string | null;
    insured: string | null;
    broker: string | null;
    totalIncurred: number;
    claimStatus: string | null;
    cause: string | null;
  } | null;
}

interface IntegrityData {
  flags: EnrichedFlag[];
  summary: Record<string, number>;
  totals: { alert: number; warning: number; total: number };
  snapshotDate: string | null;
  pipelineStatus?: 'ok' | 'no_imports' | 'no_flags_for_latest';
  importRunId?: string;
}

const FLAG_TYPE_LABELS: Record<string, string> = {
  BIG_CLAIM: 'Big Claim',
  RESERVE_UNDER: 'Reserve Under',
  RESERVE_OVER: 'Reserve Over',
  DUPLICATE_INSURED: 'Duplicate Insured',
  DUPLICATE_PAYEE_VAT: 'Duplicate VAT',
  CASH_LIEU_AND_REPAIR: 'Cash + Repair',
  SAME_DAY_AUTH_PRINT: 'Same-Day Auth',
  SELF_AUTHORISED: 'Self-Authorised',
  VALUE_CREEP: 'Value Creep',
  REOPENED: 'Reopened',
  UNASSIGNED: 'Unassigned',
  TAT_BREACH: 'TAT Breach',
  NO_PAYMENT_30_DAYS: 'No Payment 30d',
};

function getFlagTypeLabel(flagType: string): string {
  return FLAG_TYPE_LABELS[flagType] ?? flagType.replace(/_/g, ' ');
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    alert: 'bg-[#FEE2E2] text-[#991B1B]',
    warning: 'bg-[#FEF3C7] text-[#92400E]',
    info: 'bg-[#EFF6FF] text-[#1E40AF]',
  };
  const style = styles[severity] ?? 'bg-[#F4F6FA] text-[#0D2761]';
  const label = severity.charAt(0).toUpperCase() + severity.slice(1);

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}

function SummaryTile({ flagType, count }: { flagType: string; count: number }) {
  return (
    <div className="bg-white border border-[#E8EEF8] rounded-xl px-4 py-3 shadow-[0_1px_3px_rgba(13,39,97,0.06)]">
      <p className="text-xs font-medium text-[#0D2761]/60 uppercase tracking-wide mb-1">
        {getFlagTypeLabel(flagType)}
      </p>
      <p className="text-2xl font-semibold text-[#0D2761] tabular-nums">{count}</p>
    </div>
  );
}

export function IntegrityClient() {
  const [data, setData] = useState<IntegrityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'alert' | 'warning'>('all');
  const [flagTypeFilter, setFlagTypeFilter] = useState<string>('all');
  const [retryingFlags, setRetryingFlags] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/integrity')
      .then(r => r.json())
      .then((d: IntegrityData & { error?: string }) => {
        if (d.error) { setError(d.error); setData(null); }
        else setData(d);
      })
      .catch(() => setError('Failed to reach the server'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#0D2761]/60">Loading integrity signals…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
        <p className="text-sm font-medium text-[#0D2761]">Failed to load integrity data</p>
        {error && <p className="text-xs text-[#0D2761]/50 mt-1">{error}</p>}
        <button onClick={loadData} className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#0D2761' }}>
          Retry
        </button>
      </div>
    );
  }

  if (data.pipelineStatus === 'no_imports') {
    return (
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
        <p className="text-sm font-medium text-[#0D2761]">No imports yet — run a claims import</p>
        <p className="text-xs text-[#0D2761]/50 mt-1">Upload a claims report in the Imports section to compute fraud signals.</p>
      </div>
    );
  }

  if (data.pipelineStatus === 'no_flags_for_latest') {
    return (
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
        <p className="text-sm font-medium text-[#0D2761]">No flags for the latest import</p>
        <p className="text-xs text-[#0D2761]/50 mt-1 mb-4">Integrity flags have not been computed for the most recent import run.</p>
        <button
          onClick={async () => {
            if (!data.importRunId) return;
            setRetryingFlags(true);
            try {
              const r = await fetch('/api/import/claims/flags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ importRunId: data.importRunId }),
              });
              if (r.ok) { loadData(); }
            } catch {
              // ignore
            } finally {
              setRetryingFlags(false);
            }
          }}
          disabled={retryingFlags}
          className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#0D2761' }}
        >
          {retryingFlags ? 'Computing…' : 'Compute flags now'}
        </button>
      </div>
    );
  }

  // Collect unique flag types for filter dropdown
  const uniqueFlagTypes = Object.keys(data.summary).sort();

  // Apply filters
  const filteredFlags = data.flags.filter(f => {
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
    if (flagTypeFilter !== 'all' && f.flagType !== flagTypeFilter) return false;
    return true;
  });

  const hasSummaryTiles = uniqueFlagTypes.length > 0;

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">Integrity &amp; Fraud Signals</h1>
        <div className="flex items-center gap-4 mt-1">
          {data.snapshotDate && (
            <p className="text-sm text-[#0D2761]/60">
              Snapshot: {formatDate(data.snapshotDate)}
            </p>
          )}
          <p className="text-sm text-[#0D2761]/60">
            <span className="font-semibold text-[#0D2761]">{data.totals.total}</span> total flags
            {' · '}
            <span className="font-semibold text-[#991B1B]">{data.totals.alert}</span> alerts
            {' · '}
            <span className="font-semibold text-[#92400E]">{data.totals.warning}</span> warnings
          </p>
        </div>
      </div>

      {/* Summary tiles by flag type */}
      {hasSummaryTiles && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
          {uniqueFlagTypes.map(ft => (
            <SummaryTile key={ft} flagType={ft} count={data.summary[ft]} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Severity filter */}
        <div className="flex items-center gap-1 bg-[#F4F6FA] border border-[#E8EEF8] rounded-lg p-1">
          {(['all', 'alert', 'warning'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                severityFilter === s
                  ? 'bg-white text-[#0D2761] shadow-sm border border-[#E8EEF8]'
                  : 'text-[#0D2761]/60 hover:text-[#0D2761]'
              }`}
            >
              {s === 'all' ? 'All Severities' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Flag type filter */}
        <select
          value={flagTypeFilter}
          onChange={e => setFlagTypeFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-medium text-[#0D2761] bg-white border border-[#E8EEF8] rounded-lg focus:outline-none focus:border-[#0D2761]/40"
        >
          <option value="all">All Flag Types</option>
          {uniqueFlagTypes.map(ft => (
            <option key={ft} value={ft}>{getFlagTypeLabel(ft)}</option>
          ))}
        </select>

        {(severityFilter !== 'all' || flagTypeFilter !== 'all') && (
          <button
            onClick={() => { setSeverityFilter('all'); setFlagTypeFilter('all'); }}
            className="px-3 py-1.5 text-xs font-medium text-[#0D2761]/60 hover:text-[#0D2761] transition-colors"
          >
            Clear filters
          </button>
        )}

        <span className="text-xs text-[#0D2761]/50 ml-auto">
          {filteredFlags.length} of {data.totals.total} flags
        </span>
      </div>

      {/* Flags table */}
      {filteredFlags.length === 0 ? (
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-[#F4F6FA] flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-[#0D2761]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[#0D2761]">
            {data.totals.total === 0 ? 'No integrity flags found' : 'No flags match the current filters'}
          </p>
          <p className="text-xs text-[#0D2761]/50 mt-1">
            {data.totals.total === 0
              ? 'Run a claims import to compute fraud signals.'
              : 'Try adjusting the severity or flag type filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(13,39,97,0.06)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                  {['Claim', 'Handler', 'Insured', 'Flag Type', 'Severity', 'Incurred', 'Detail'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-[#0D2761]/60 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredFlags.map((flag, idx) => (
                  <tr
                    key={flag.id}
                    className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/50' : ''}`}
                  >
                    {/* Claim ID */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <a
                        href={`/claims/${encodeURIComponent(flag.claimId)}`}
                        className="font-mono text-sm font-semibold text-[#0D2761] hover:underline"
                      >
                        {flag.claimId}
                      </a>
                    </td>

                    {/* Handler */}
                    <td className="px-4 py-3 text-[#0D2761]/80 whitespace-nowrap">
                      {flag.claim?.handler ?? '—'}
                    </td>

                    {/* Insured */}
                    <td className="px-4 py-3 text-[#0D2761]/80 max-w-[160px] truncate">
                      {flag.claim?.insured ?? '—'}
                    </td>

                    {/* Flag type */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-[#0D2761]/8 text-[#0D2761]">
                        {getFlagTypeLabel(flag.flagType)}
                      </span>
                    </td>

                    {/* Severity */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <SeverityBadge severity={flag.severity} />
                    </td>

                    {/* Total incurred */}
                    <td className="px-4 py-3 tabular-nums text-[#0D2761]/80 whitespace-nowrap">
                      {flag.claim ? formatZAR(flag.claim.totalIncurred, 0) : '—'}
                    </td>

                    {/* Detail */}
                    <td className="px-4 py-3 text-xs text-[#0D2761]/60 max-w-[200px] truncate" title={flag.detail ?? undefined}>
                      {flag.detail ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
