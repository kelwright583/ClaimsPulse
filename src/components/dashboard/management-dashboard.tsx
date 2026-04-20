'use client';

import { useState, useEffect } from 'react';
import { StatCard } from '@/components/ui/stat-card';
import { formatZAR, formatDate } from '@/lib/utils';

interface ManagementSummary {
  openClaims: number;
  tatBreaches: number;
  totalIncurred: number;
  totalOs: number;
  totalPaid: number;
  totalGwp: number;
  totalNetWp: number;
  lossRatio: number | null;
  uwResultNet: number;
  hasPremiumData: boolean;
  hasMovementData: boolean;
}

interface StatusRow {
  status: string;
  count: number;
}

interface HandlerRow {
  handler: string;
  count: number;
  totalIncurred: number;
}

interface ManagementData {
  summary: ManagementSummary;
  statusBreakdown: StatusRow[];
  topHandlers: HandlerRow[];
  snapshotDate: string | null;
}

// Loss ratio thresholds
const LR_GREEN = 65;
const LR_AMBER = 80;

function lossRatioColor(lr: number): { text: string; bg: string; label: string } {
  if (lr < LR_GREEN) return { text: '#065F46', bg: '#D1FAE5', label: 'On Target' };
  if (lr < LR_AMBER) return { text: '#92400E', bg: '#FEF3C7', label: 'Elevated' };
  return { text: '#991B1B', bg: '#FEE2E2', label: 'Critical' };
}

function LossRatioIndicator({ lossRatio }: { lossRatio: number }) {
  const { text, bg, label } = lossRatioColor(lossRatio);
  // Clamp display to 0–120 for the bar
  const barWidth = Math.min((lossRatio / 120) * 100, 100);

  return (
    <div
      className="rounded-xl p-5 border"
      style={{ backgroundColor: bg, borderColor: text + '33' }}
    >
      <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: text }}>
        Loss Ratio
      </p>
      <div className="flex items-end gap-3 mb-3">
        <span className="text-3xl font-semibold tabular-nums" style={{ color: text }}>
          {lossRatio.toFixed(1)}%
        </span>
        <span
          className="text-xs font-semibold mb-1 px-2 py-0.5 rounded-full"
          style={{ color: text, backgroundColor: text + '22' }}
        >
          {label}
        </span>
      </div>
      {/* Zone bar */}
      <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: text + '22' }}>
        {/* Zones */}
        <div className="absolute inset-0 flex">
          <div className="h-full bg-[#065F46]/40" style={{ width: `${(LR_GREEN / 120) * 100}%` }} />
          <div className="h-full bg-[#92400E]/40" style={{ width: `${((LR_AMBER - LR_GREEN) / 120) * 100}%` }} />
          <div className="h-full bg-[#991B1B]/40 flex-1" />
        </div>
        {/* Needle */}
        <div
          className="absolute top-0 h-full w-1 rounded-full -translate-x-1/2"
          style={{ left: `${barWidth}%`, backgroundColor: text }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs" style={{ color: text + 'aa' }}>0%</span>
        <span className="text-xs" style={{ color: text + 'aa' }}>{LR_GREEN}%</span>
        <span className="text-xs" style={{ color: text + 'aa' }}>{LR_AMBER}%</span>
        <span className="text-xs" style={{ color: text + 'aa' }}>120%</span>
      </div>
    </div>
  );
}

const STATUS_ORDER = ['Open', 'Finalised', 'Re-opened', 'Repudiated', 'Cancelled', 'Pending'];

function statusColor(status: string): { text: string; bar: string } {
  const s = status.toLowerCase();
  if (s === 'finalised') return { text: '#065F46', bar: '#065F46' };
  if (s === 'repudiated' || s === 'cancelled') return { text: '#6B7280', bar: '#9CA3AF' };
  if (s === 're-opened') return { text: '#92400E', bar: '#F5A800' };
  return { text: '#0D2761', bar: '#0D2761' };
}

export function ManagementDashboard() {
  const [data, setData] = useState<ManagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthlyClaimsBudget, setMonthlyClaimsBudget] = useState<number>(0);

  useEffect(() => {
    fetch('/api/dashboard/management')
      .then(r => r.json())
      .then((d: ManagementData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d.settings?.monthlyClaimsBudget !== undefined) {
          setMonthlyClaimsBudget(Number(d.settings.monthlyClaimsBudget));
        }
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-sm text-[#6B7280]">Loading management overview...</div>
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

  const { summary, statusBreakdown, topHandlers, snapshotDate } = data;

  // Sort status breakdown with known order first, then alphabetical
  const sortedStatuses = [...statusBreakdown].sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a.status);
    const bi = STATUS_ORDER.indexOf(b.status);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.status.localeCompare(b.status);
  });

  const totalStatusCount = sortedStatuses.reduce((s, r) => s + r.count, 0);

  const uwIsPositive = summary.uwResultNet >= 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">Management Overview</h1>
        {snapshotDate && (
          <p className="text-sm text-[#6B7280] mt-1">
            Snapshot: {formatDate(snapshotDate)}
          </p>
        )}
      </div>

      {/* TAT breach alert */}
      {summary.tatBreaches > 0 && (
        <div className="mb-6 flex items-center justify-between gap-4 px-4 py-3 bg-[#FEE2E2] border border-[#991B1B]/30 rounded-xl">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#991B1B] opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#991B1B]" />
            </span>
            <p className="text-sm font-semibold text-[#991B1B]">
              {summary.tatBreaches} claim{summary.tatBreaches !== 1 ? 's' : ''} currently breaching TAT
            </p>
          </div>
          <a href="/tat" className="text-xs font-medium text-[#991B1B] hover:underline flex-shrink-0">
            View TAT Watchlist →
          </a>
        </div>
      )}

      {/* Row 1: Claims stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard
          label="Open Claims"
          value={summary.openClaims.toLocaleString()}
          variant="default"
        />
        <StatCard
          label="TAT Breaches"
          value={summary.tatBreaches}
          variant={summary.tatBreaches > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Total Incurred"
          value={formatZAR(summary.totalIncurred, 0)}
          variant="default"
        />
        <StatCard
          label="Outstanding"
          value={formatZAR(summary.totalOs, 0)}
          variant="default"
        />
      </div>

      {/* Row 2: Financial stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Paid"
          value={formatZAR(summary.totalPaid, 0)}
          variant="default"
        />
        <StatCard
          label="Gross Written Premium"
          value={summary.hasPremiumData ? formatZAR(summary.totalGwp, 0) : '—'}
          variant="default"
        />
        <StatCard
          label="Net Written Premium"
          value={summary.hasPremiumData ? formatZAR(summary.totalNetWp, 0) : '—'}
          variant="default"
        />
        <StatCard
          label="UW Result (Net)"
          value={summary.hasMovementData ? formatZAR(summary.uwResultNet, 0) : '—'}
          variant={summary.hasMovementData ? (uwIsPositive ? 'success' : 'danger') : 'default'}
        />
      </div>

      {/* Loss ratio indicator */}
      {summary.lossRatio !== null && (
        <div className="mb-8">
          <LossRatioIndicator lossRatio={summary.lossRatio} />
        </div>
      )}

      {/* Budget Runway */}
      <div className="mb-8">
        {monthlyClaimsBudget === 0 ? (
          <div
            className="bg-white border rounded-xl px-5 py-4 flex items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
            style={{ borderColor: '#E8EEF8' }}
          >
            <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#F5A800' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm" style={{ color: '#6B7280' }}>
              Budget not configured —{' '}
              <a href="/settings/general" className="underline font-medium" style={{ color: '#0D2761' }}>
                visit Settings &gt; General
              </a>{' '}
              to set a monthly claims budget.
            </p>
          </div>
        ) : (() => {
          const budgetUsed = summary.totalIncurred;
          const budgetRemaining = monthlyClaimsBudget - budgetUsed;
          const pctUsed = Math.min((budgetUsed / monthlyClaimsBudget) * 100, 100);
          const isOver = budgetRemaining < 0;

          const barColor =
            pctUsed < 65 ? '#065F46' : pctUsed < 80 ? '#F5A800' : '#991B1B';
          const barBg =
            pctUsed < 65 ? '#D1FAE5' : pctUsed < 80 ? '#FEF3C7' : '#FEE2E2';

          return (
            <div
              className="bg-white border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden"
              style={{ borderColor: '#E8EEF8' }}
            >
              <div
                className="px-5 py-3 border-b flex items-center justify-between"
                style={{ borderColor: '#E8EEF8', backgroundColor: '#F4F6FA' }}
              >
                <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6B7280' }}>
                  Budget Runway
                </h3>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums"
                  style={{ color: barColor, backgroundColor: barBg }}
                >
                  {pctUsed.toFixed(1)}% consumed
                </span>
              </div>
              <div className="px-5 py-4">
                {/* Labels */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm tabular-nums font-medium" style={{ color: '#0D2761' }}>
                    {formatZAR(budgetUsed, 0)} consumed of {formatZAR(monthlyClaimsBudget, 0)} budget
                  </span>
                  {isOver ? (
                    <span className="text-sm tabular-nums font-semibold" style={{ color: '#991B1B' }}>
                      {formatZAR(Math.abs(budgetRemaining), 0)} over budget
                    </span>
                  ) : (
                    <span className="text-sm tabular-nums font-medium" style={{ color: '#065F46' }}>
                      {formatZAR(budgetRemaining, 0)} remaining
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#E8EEF8' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pctUsed}%`,
                      backgroundColor: barColor,
                    }}
                  />
                </div>

                {/* Zone ticks */}
                <div className="relative mt-1 h-4">
                  <div className="absolute left-[65%] flex flex-col items-center">
                    <div className="w-px h-2 mt-0" style={{ backgroundColor: '#92400E' }} />
                    <span className="text-xs tabular-nums" style={{ color: '#92400E' }}>65%</span>
                  </div>
                  <div className="absolute left-[80%] flex flex-col items-center">
                    <div className="w-px h-2 mt-0" style={{ backgroundColor: '#991B1B' }} />
                    <span className="text-xs tabular-nums" style={{ color: '#991B1B' }}>80%</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Middle row: Status breakdown + Top handlers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Status breakdown */}
        <div>
          <h2 className="text-base font-semibold text-[#0D2761] mb-3">Claims by Status</h2>
          <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            {sortedStatuses.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#6B7280]">
                No snapshot data available.
              </div>
            ) : (
              sortedStatuses.map((row, idx) => {
                const pct = totalStatusCount > 0 ? (row.count / totalStatusCount) * 100 : 0;
                const colors = statusColor(row.status);
                return (
                  <div
                    key={row.status}
                    className={`px-4 py-3 ${idx < sortedStatuses.length - 1 ? 'border-b border-[#E8EEF8]' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium" style={{ color: colors.text }}>
                        {row.status}
                      </span>
                      <span className="text-sm tabular-nums font-semibold text-[#0D2761]">
                        {row.count.toLocaleString()}
                        <span className="text-xs font-normal text-[#6B7280] ml-1">
                          ({pct.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#F4F6FA] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: colors.bar }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Top handlers */}
        <div>
          <h2 className="text-base font-semibold text-[#0D2761] mb-3">Top 5 Handlers by Open Claims</h2>
          <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            {topHandlers.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#6B7280]">
                No handler data available.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">
                      Handler
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                      Open Claims
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                      Total Incurred
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topHandlers.map((row, idx) => (
                    <tr
                      key={row.handler}
                      className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/60' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-[#0D2761]">{row.handler}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#0D2761]">
                        {row.count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#6B7280]">
                        {formatZAR(row.totalIncurred, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Navigation links */}
      <div className="flex flex-wrap gap-3">
        <a
          href="/financial"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0D2761] text-white text-sm font-medium rounded-lg hover:bg-[#0D2761]/90 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
            <circle cx="8" cy="8" r="4" />
            <path d="M6.5 9.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5S9.5 7 8.5 7C7.67 7 7 6.33 7 5.5S7.67 4 8.5 4 10 4.67 10 5.5" />
          </svg>
          View Financial Details
        </a>
        <a
          href="/productivity"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#E8EEF8] text-[#0D2761] text-sm font-medium rounded-lg hover:bg-[#F4F6FA] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 12l4-4 3 3 5-7" />
          </svg>
          View Team Productivity
        </a>
      </div>
    </div>
  );
}
