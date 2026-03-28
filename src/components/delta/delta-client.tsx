'use client';

import { useState, useEffect } from 'react';
import { formatZAR, formatDate } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ClaimSnap {
  claimId: string;
  handler: string | null;
  insured: string | null;
  claimStatus: string | null;
  secondaryStatus: string | null;
  totalIncurred: number | null;
  totalOs: number | null;
  cause: string | null;
}

interface StatusChange {
  claimId: string;
  handler: string | null;
  insured: string | null;
  from: string | null;
  to: string | null;
  secondaryFrom: string | null;
  secondaryTo: string | null;
}

interface ValueJump {
  claimId: string;
  handler: string | null;
  insured: string | null;
  prevIncurred: number;
  currIncurred: number;
  pctChange: number;
}

interface DeltaSummary {
  new: number;
  finalised: number;
  statusChanges: number;
  valueJumps: number;
  reopened: number;
}

interface DeltaData {
  today: string | null;
  yesterday: string | null;
  newClaims: ClaimSnap[];
  finalisedClaims: ClaimSnap[];
  statusChanges: StatusChange[];
  valueJumps: ValueJump[];
  reopened: ClaimSnap[];
  summary: DeltaSummary;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type TabId = 'new' | 'finalised' | 'statusChanges' | 'valueJumps' | 'reopened';

const TABS: { id: TabId; label: string; summaryKey: keyof DeltaSummary }[] = [
  { id: 'new', label: 'New Claims', summaryKey: 'new' },
  { id: 'finalised', label: 'Finalised', summaryKey: 'finalised' },
  { id: 'statusChanges', label: 'Status Changes', summaryKey: 'statusChanges' },
  { id: 'valueJumps', label: 'Value Jumps', summaryKey: 'valueJumps' },
  { id: 'reopened', label: 'Reopened', summaryKey: 'reopened' },
];

function ClaimLink({ claimId }: { claimId: string }) {
  return (
    <a
      href={`/claims/${encodeURIComponent(claimId)}`}
      className="font-mono text-sm font-medium text-[#0D2761] hover:underline"
    >
      {claimId}
    </a>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-12 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#D1FAE5] mb-3">
        <svg className="w-6 h-6 text-[#065F46]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-sm font-medium text-[#065F46]">No {label}</p>
      <p className="text-xs text-[#6B7280] mt-1">Nothing to show between these two snapshots.</p>
    </div>
  );
}

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

// ── Tab panels ─────────────────────────────────────────────────────────────────

function NewClaimsPanel({ claims }: { claims: ClaimSnap[] }) {
  if (claims.length === 0) return <EmptyState label="new claims" />;
  return (
    <TableWrapper>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Claim ID</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Handler</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Insured</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Cause</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">Incurred</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((c, idx) => (
            <tr key={c.claimId} className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/50' : ''}`}>
              <td className="px-4 py-3"><ClaimLink claimId={c.claimId} /></td>
              <td className="px-4 py-3 text-[#0D2761]">{c.handler ?? '—'}</td>
              <td className="px-4 py-3 text-[#6B7280] max-w-[180px] truncate">{c.insured ?? '—'}</td>
              <td className="px-4 py-3 text-[#0D2761]">{c.claimStatus ?? '—'}</td>
              <td className="px-4 py-3 text-[#6B7280]">{c.cause ?? '—'}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[#0D2761]">{formatZAR(c.totalIncurred, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrapper>
  );
}

function FinalisedPanel({ claims }: { claims: ClaimSnap[] }) {
  if (claims.length === 0) return <EmptyState label="finalised claims" />;
  return (
    <TableWrapper>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Claim ID</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Handler</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Insured</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Cause</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">Total Incurred</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((c, idx) => (
            <tr key={c.claimId} className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/50' : ''}`}>
              <td className="px-4 py-3"><ClaimLink claimId={c.claimId} /></td>
              <td className="px-4 py-3 text-[#0D2761]">{c.handler ?? '—'}</td>
              <td className="px-4 py-3 text-[#6B7280] max-w-[180px] truncate">{c.insured ?? '—'}</td>
              <td className="px-4 py-3 text-[#6B7280]">{c.cause ?? '—'}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[#065F46] font-semibold">{formatZAR(c.totalIncurred, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrapper>
  );
}

function StatusChangesPanel({ changes }: { changes: StatusChange[] }) {
  if (changes.length === 0) return <EmptyState label="status changes" />;
  return (
    <TableWrapper>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Claim ID</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Handler</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Insured</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">From Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">To Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">Secondary Change</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c, idx) => (
            <tr key={`${c.claimId}-${idx}`} className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/50' : ''}`}>
              <td className="px-4 py-3"><ClaimLink claimId={c.claimId} /></td>
              <td className="px-4 py-3 text-[#0D2761]">{c.handler ?? '—'}</td>
              <td className="px-4 py-3 text-[#6B7280] max-w-[160px] truncate">{c.insured ?? '—'}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#E8EEF8] text-[#6B7280]">
                  {c.from ?? '—'}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  c.to === 'Finalised'
                    ? 'bg-[#D1FAE5] text-[#065F46]'
                    : c.to === 'Re-opened'
                    ? 'bg-[#FEF3C7] text-[#92400E]'
                    : 'bg-[#E8EEF8] text-[#0D2761]'
                }`}>
                  {c.to ?? '—'}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-[#6B7280]">
                {c.secondaryFrom !== c.secondaryTo && (c.secondaryFrom || c.secondaryTo)
                  ? `${c.secondaryFrom ?? '—'} → ${c.secondaryTo ?? '—'}`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrapper>
  );
}

function ValueJumpsPanel({ jumps }: { jumps: ValueJump[] }) {
  if (jumps.length === 0) return <EmptyState label="value jumps" />;
  return (
    <TableWrapper>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Claim ID</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Handler</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Insured</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">Previous Incurred</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">Current Incurred</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">Change</th>
          </tr>
        </thead>
        <tbody>
          {jumps.map((j, idx) => (
            <tr key={j.claimId} className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/50' : ''}`}>
              <td className="px-4 py-3"><ClaimLink claimId={j.claimId} /></td>
              <td className="px-4 py-3 text-[#0D2761]">{j.handler ?? '—'}</td>
              <td className="px-4 py-3 text-[#6B7280] max-w-[160px] truncate">{j.insured ?? '—'}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[#6B7280]">{formatZAR(j.prevIncurred, 0)}</td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#0D2761]">{formatZAR(j.currIncurred, 0)}</td>
              <td className="px-4 py-3 text-right">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums ${
                  j.pctChange >= 50 ? 'text-[#991B1B]' : 'text-[#92400E]'
                }`}>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
                  </svg>
                  +{j.pctChange.toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrapper>
  );
}

function ReopenedPanel({ claims }: { claims: ClaimSnap[] }) {
  if (claims.length === 0) return <EmptyState label="reopened claims" />;
  return (
    <TableWrapper>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Claim ID</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Handler</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Insured</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Cause</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((c, idx) => (
            <tr key={c.claimId} className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/50' : ''}`}>
              <td className="px-4 py-3"><ClaimLink claimId={c.claimId} /></td>
              <td className="px-4 py-3 text-[#0D2761]">{c.handler ?? '—'}</td>
              <td className="px-4 py-3 text-[#6B7280] max-w-[180px] truncate">{c.insured ?? '—'}</td>
              <td className="px-4 py-3 text-[#6B7280]">{c.cause ?? '—'}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[#92400E] font-semibold">{formatZAR(c.totalOs, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrapper>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DeltaClient() {
  const [data, setData] = useState<DeltaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('new');

  useEffect(() => {
    fetch('/api/delta')
      .then(r => r.json())
      .then((d: DeltaData) => {
        setData(d);
        // Default to the tab with the most activity
        if (d.summary) {
          const counts: [TabId, number][] = [
            ['new', d.summary.new],
            ['statusChanges', d.summary.statusChanges],
            ['valueJumps', d.summary.valueJumps],
            ['finalised', d.summary.finalised],
            ['reopened', d.summary.reopened],
          ];
          const topTab = counts.reduce((best, cur) => cur[1] > best[1] ? cur : best, counts[0]);
          if (topTab[1] > 0) setActiveTab(topTab[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-sm text-[#6B7280]">Computing snapshot delta...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
        <p className="text-sm text-[#6B7280]">Failed to load delta data.</p>
      </div>
    );
  }

  if (!data.yesterday) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#0D2761]">Daily Delta</h1>
          {data.today && (
            <p className="text-sm text-[#6B7280] mt-1">
              Snapshot: {formatDate(data.today)}
            </p>
          )}
        </div>
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
          <p className="text-sm text-[#6B7280]">
            Only one snapshot is available. A second import is required to compute changes.
          </p>
        </div>
      </div>
    );
  }

  const { summary } = data;
  const totalChanges = summary.new + summary.finalised + summary.statusChanges + summary.valueJumps + summary.reopened;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">Daily Delta</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Comparing {formatDate(data.today)} vs {formatDate(data.yesterday)}
        </p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {[
          { label: 'New Claims', value: summary.new, bg: '#E8EEF8', text: '#0D2761' },
          { label: 'Finalised', value: summary.finalised, bg: '#D1FAE5', text: '#065F46' },
          { label: 'Status Changes', value: summary.statusChanges, bg: '#FEF3C7', text: '#92400E' },
          { label: 'Value Jumps', value: summary.valueJumps, bg: '#FEE2E2', text: '#991B1B' },
          { label: 'Reopened', value: summary.reopened, bg: '#FEF3C7', text: '#92400E' },
        ].map(item => (
          <div
            key={item.label}
            className="rounded-xl p-4 text-center border"
            style={{ backgroundColor: item.bg, borderColor: item.text + '22' }}
          >
            <p className="text-2xl font-semibold tabular-nums" style={{ color: item.text }}>
              {item.value.toLocaleString()}
            </p>
            <p className="text-xs font-medium mt-1" style={{ color: item.text + 'bb' }}>
              {item.label}
            </p>
          </div>
        ))}
      </div>

      {totalChanges === 0 ? (
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#D1FAE5] mb-4">
            <svg className="w-7 h-7 text-[#065F46]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-base font-semibold text-[#065F46]">No changes detected</p>
          <p className="text-sm text-[#6B7280] mt-1">The two snapshots are identical.</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-[#E8EEF8] mb-6 overflow-x-auto">
            {TABS.map(tab => {
              const count = summary[tab.summaryKey];
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-[#0D2761] text-[#0D2761]'
                      : 'border-transparent text-[#6B7280] hover:text-[#0D2761] hover:border-[#E8EEF8]'
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold ${
                        isActive
                          ? 'bg-[#0D2761] text-white'
                          : 'bg-[#E8EEF8] text-[#6B7280]'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {activeTab === 'new' && <NewClaimsPanel claims={data.newClaims} />}
          {activeTab === 'finalised' && <FinalisedPanel claims={data.finalisedClaims} />}
          {activeTab === 'statusChanges' && <StatusChangesPanel changes={data.statusChanges} />}
          {activeTab === 'valueJumps' && <ValueJumpsPanel jumps={data.valueJumps} />}
          {activeTab === 'reopened' && <ReopenedPanel claims={data.reopened} />}
        </>
      )}
    </div>
  );
}
