'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle, AlertTriangle, CheckCircle, Download, Loader2 } from 'lucide-react';

interface ActionItem {
  claimId: string;
  secondaryStatus: string | null;
  daysInStatus: number | null;
  outstanding: number;
  priority: 'critical' | 'urgent' | 'standard';
  tatStatus: 'BREACH' | 'AT RISK' | 'ON TRACK';
}

interface HandlerDetailData {
  handler: string;
  toDate: string;
  fromDate: string | null;
  metrics: {
    criticalCurrent: number;
    urgentCurrent: number;
    standardCurrent: number;
    tatBreachesCurrent: number;
    totalOsCurrent: number;
    finalisedCurrent: number;
  };
  portfolio: { critical: number; urgent: number; standard: number; finalised: number; totalOpen: number };
  criticalItems: ActionItem[];
  urgentItems: ActionItem[];
  standardItems: ActionItem[];
  comparison: {
    criticalPrevious: number;
    urgentPrevious: number;
    standardPrevious: number;
    tatBreachesPrevious: number;
    totalOsPrevious: number;
    finalisedPrevious: number;
    stuckClaims: Array<{ claimId: string; secondaryStatus: string | null; daysInStatus: number | null; outstanding: number }>;
    improvedClaims: Array<{ claimId: string; previousStatus: string | null; currentStatus: string | null; outstanding: number }>;
    worsenedClaims: Array<{ claimId: string; previousStatus: string | null; currentStatus: string | null; outstanding: number }>;
  } | null;
}

interface Props {
  handler: string;
  toDate?: string;
  fromDate?: string;
  isComparing: boolean;
  onClose: () => void;
}

function formatZAR(v: number) {
  if (v >= 1_000_000) return `R${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R${(v / 1_000).toFixed(0)}K`;
  return `R${v.toLocaleString('en-ZA')}`;
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function DeltaMetricCard({ label, current, previous, lowerIsBetter }: {
  label: string;
  current: number;
  previous: number | null;
  lowerIsBetter: boolean;
}) {
  const delta = previous !== null ? current - previous : null;
  const improved = delta !== null && (lowerIsBetter ? delta < 0 : delta > 0);
  const unchanged = delta === null || Math.abs(delta) < 0.001;
  const color = unchanged ? '#6B7280' : improved ? '#16A34A' : '#DC2626';
  const arrow = unchanged || delta === null ? '→' : delta < 0 ? '↓' : '↑';

  return (
    <div className="bg-white rounded-xl border border-[#E8EEF8] p-4">
      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#0D2761]">{current.toLocaleString()}</p>
      {previous !== null && (
        <p className="text-xs mt-1 tabular-nums" style={{ color }}>
          {arrow} {Math.abs(delta ?? 0).toLocaleString()} <span className="text-[#9CA3AF]">vs {previous.toLocaleString()}</span>
        </p>
      )}
    </div>
  );
}

function TatBadge({ status }: { status: 'BREACH' | 'AT RISK' | 'ON TRACK' }) {
  if (status === 'BREACH') return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FEE2E2] text-[#991B1B]">BREACH</span>
  );
  if (status === 'AT RISK') return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FEF3C7] text-[#92400E]">AT RISK</span>
  );
  return null;
}

function ActionTable({ items, section }: { items: ActionItem[]; section: 'critical' | 'urgent' | 'standard' }) {
  if (items.length === 0) return null;
  const headerColors = {
    critical: 'bg-[#DC2626] text-white',
    urgent: 'bg-[#F5A800] text-[#0D2761]',
    standard: 'bg-[#1E5BC6] text-white',
  };
  const labels = { critical: 'Critical', urgent: 'Urgent', standard: 'Standard' };
  const icons = { critical: AlertCircle, urgent: AlertTriangle, standard: CheckCircle };
  const Icon = icons[section];

  return (
    <div className="mb-4">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${headerColors[section]}`}>
        <Icon className="w-4 h-4" strokeWidth={2} />
        <span className="text-sm font-semibold">{labels[section]} ({items.length})</span>
      </div>
      <div className="border border-t-0 border-[#E8EEF8] rounded-b-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[#F4F6FA]">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-[#6B7280]">Claim ID</th>
              <th className="px-3 py-2 text-left font-semibold text-[#6B7280]">Secondary Status</th>
              <th className="px-3 py-2 text-center font-semibold text-[#6B7280]">Days</th>
              <th className="px-3 py-2 text-right font-semibold text-[#6B7280]">Outstanding</th>
              <th className="px-3 py-2 text-center font-semibold text-[#6B7280]">TAT</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.claimId} className={idx % 2 === 1 ? 'bg-[#F4F6FA]/50' : ''}>
                <td className="px-3 py-2 font-semibold text-[#0D2761]">{item.claimId}</td>
                <td className="px-3 py-2 text-[#6B7280] max-w-[180px] truncate">{item.secondaryStatus ?? '—'}</td>
                <td className="px-3 py-2 text-center tabular-nums">{item.daysInStatus ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatZAR(item.outstanding)}</td>
                <td className="px-3 py-2 text-center"><TatBadge status={item.tatStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HandlerDetailModal({ handler, toDate, fromDate, isComparing, onClose }: Props) {
  const [data, setData] = useState<HandlerDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ handler });
    if (toDate) params.set('toDate', toDate);
    if (fromDate) params.set('fromDate', fromDate);
    fetch(`/api/dashboard/handler-detail?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [handler, toDate, fromDate]);

  const handleGeneratePdf = useCallback(async () => {
    if (!data) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/reports/handler-performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handler, toDate, fromDate }),
      });
      if (!res.ok) throw new Error('PDF generation failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${handler.replace(/\s+/g, '_')}_Performance_${toDate ?? new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  }, [data, handler, toDate, fromDate]);

  const cmp = data?.comparison;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-3xl sm:mx-4 sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#0D2761] px-6 py-5 flex items-start justify-between flex-shrink-0">
          <div>
            <p className="text-white/60 text-xs font-medium uppercase tracking-wider">Handler Detail</p>
            <h2 className="text-white font-bold text-lg mt-0.5">{handler}</h2>
            {data && (
              <p className="text-white/60 text-xs mt-1">
                {isComparing && data.fromDate
                  ? `${formatDate(data.fromDate)} → ${formatDate(data.toDate)}`
                  : formatDate(data.toDate)}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 bg-[#F4F6FA] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !data ? (
            <p className="text-sm text-[#6B7280] py-8 text-center">Failed to load data.</p>
          ) : isComparing && cmp ? (
            <>
              {/* Delta metrics grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                <DeltaMetricCard label="Critical Claims" current={data.metrics.criticalCurrent} previous={cmp.criticalPrevious} lowerIsBetter />
                <DeltaMetricCard label="Urgent Claims" current={data.metrics.urgentCurrent} previous={cmp.urgentPrevious} lowerIsBetter />
                <DeltaMetricCard label="Standard Claims" current={data.metrics.standardCurrent} previous={cmp.standardPrevious} lowerIsBetter />
                <DeltaMetricCard label="TAT Breaches" current={data.metrics.tatBreachesCurrent} previous={cmp.tatBreachesPrevious} lowerIsBetter />
                <DeltaMetricCard label="Total Outstanding" current={data.metrics.totalOsCurrent} previous={cmp.totalOsPrevious} lowerIsBetter />
                <DeltaMetricCard label="Claims Finalised" current={data.metrics.finalisedCurrent} previous={cmp.finalisedPrevious} lowerIsBetter={false} />
              </div>

              {/* Stuck claims */}
              {cmp.stuckClaims.length > 0 && (
                <div className="bg-[#FEF2F2] border-l-4 border-[#DC2626] rounded-r-xl p-4 mb-4">
                  <h3 className="text-sm font-bold text-[#991B1B] mb-2">⚠ No movement detected ({cmp.stuckClaims.length})</h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#DC2626] text-white">
                        <th className="px-2 py-1.5 text-left">Claim ID</th>
                        <th className="px-2 py-1.5 text-left">Secondary Status</th>
                        <th className="px-2 py-1.5 text-center">Days</th>
                        <th className="px-2 py-1.5 text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cmp.stuckClaims.map((c, idx) => (
                        <tr key={c.claimId} className={idx % 2 === 1 ? 'bg-[#FEF2F2]' : 'bg-white'}>
                          <td className="px-2 py-1.5 font-semibold text-[#991B1B]">{c.claimId}</td>
                          <td className="px-2 py-1.5 text-[#6B7280] max-w-[200px] truncate">{c.secondaryStatus ?? '—'}</td>
                          <td className="px-2 py-1.5 text-center">{c.daysInStatus ?? '—'}</td>
                          <td className="px-2 py-1.5 text-right">{formatZAR(c.outstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Improved claims */}
              {cmp.improvedClaims.length > 0 && (
                <div className="bg-[#F0FFF4] border-l-4 border-[#16A34A] rounded-r-xl p-4 mb-4">
                  <h3 className="text-sm font-bold text-[#166534] mb-2">✓ Progress made ({cmp.improvedClaims.length})</h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#16A34A] text-white">
                        <th className="px-2 py-1.5 text-left">Claim ID</th>
                        <th className="px-2 py-1.5 text-left">Was</th>
                        <th className="px-2 py-1.5 text-left">Now</th>
                        <th className="px-2 py-1.5 text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cmp.improvedClaims.map((c, idx) => (
                        <tr key={c.claimId} className={idx % 2 === 1 ? 'bg-[#F0FFF4]' : 'bg-white'}>
                          <td className="px-2 py-1.5 font-semibold text-[#166534]">
                            {c.currentStatus === null ? '✓ ' : ''}{c.claimId}
                          </td>
                          <td className="px-2 py-1.5 text-[#6B7280] max-w-[160px] truncate">{c.previousStatus ?? '—'}</td>
                          <td className="px-2 py-1.5 text-[#166534] max-w-[160px] truncate">{c.currentStatus ?? 'Resolved'}</td>
                          <td className="px-2 py-1.5 text-right">{formatZAR(c.outstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Worsened claims */}
              {cmp.worsenedClaims.length > 0 && (
                <div className="bg-[#FFFBEB] border-l-4 border-[#F5A800] rounded-r-xl p-4 mb-4">
                  <h3 className="text-sm font-bold text-[#92400E] mb-2">↑ Needs attention ({cmp.worsenedClaims.length})</h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#F5A800] text-[#0D2761]">
                        <th className="px-2 py-1.5 text-left">Claim ID</th>
                        <th className="px-2 py-1.5 text-left">Was</th>
                        <th className="px-2 py-1.5 text-left">Now</th>
                        <th className="px-2 py-1.5 text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cmp.worsenedClaims.map((c, idx) => (
                        <tr key={c.claimId} className={idx % 2 === 1 ? 'bg-[#FFFBEB]' : 'bg-white'}>
                          <td className="px-2 py-1.5 font-semibold text-[#92400E]">{c.claimId}</td>
                          <td className="px-2 py-1.5 text-[#6B7280] max-w-[160px] truncate">{c.previousStatus ?? '—'}</td>
                          <td className="px-2 py-1.5 text-[#92400E] max-w-[160px] truncate">{c.currentStatus ?? '—'}</td>
                          <td className="px-2 py-1.5 text-right">{formatZAR(c.outstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Non-compare mode: portfolio summary + action list */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-[#F4F6FA] rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-[#0D2761]">{data.portfolio.totalOpen}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">Open</p>
                </div>
                <div className="bg-[#F4F6FA] rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-[#DC2626]">{data.metrics.tatBreachesCurrent}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">TAT Breaches</p>
                </div>
                <div className="bg-[#F4F6FA] rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-[#065F46]">{data.metrics.finalisedCurrent}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">Finalised</p>
                </div>
              </div>
              <p className="text-xs text-[#6B7280] mb-1">Total outstanding: <span className="font-semibold text-[#0D2761]">{formatZAR(data.metrics.totalOsCurrent)}</span></p>

              <div className="mt-4">
                <ActionTable items={data.criticalItems} section="critical" />
                <ActionTable items={data.urgentItems} section="urgent" />
                <ActionTable items={data.standardItems} section="standard" />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#E8EEF8] bg-[#F8FAFF] flex-shrink-0">
          <button
            onClick={handleGeneratePdf}
            disabled={generating || loading}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              generating || loading
                ? 'bg-[#E8EEF8] text-[#6B7280] cursor-not-allowed'
                : 'bg-[#0D2761] text-white hover:bg-[#1E5BC6]'
            }`}
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> : <Download className="w-4 h-4" strokeWidth={2} />}
            {generating ? 'Generating PDF…' : 'Generate PDF Report'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
