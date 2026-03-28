'use client';

import { useState, useEffect } from 'react';
import { StatCard } from '@/components/ui/stat-card';
import { SlaBadge, Badge } from '@/components/ui/badge';
import { AcknowledgedDelayModal } from '@/components/claims/acknowledged-delay-modal';
import { formatDate } from '@/lib/utils';
import type { SlaPriority } from '@/types/claims';

interface SlaClaimRow {
  id: string;
  claimId: string;
  handler: string | null;
  insured: string | null;
  secondaryStatus: string | null;
  daysInCurrentStatus: number | null;
  isSlaBreach: boolean;
}

interface GroupData {
  priority: string;
  maxDays: number;
  claims: SlaClaimRow[];
}

interface SlaStats {
  total: number;
  critical: number;
  urgent: number;
  standard: number;
}

interface ActiveDelay {
  claimId: string;
  secondaryStatus: string;
  reasonType: string;
  expectedDate: string;
}

interface SlaData {
  grouped: Record<string, GroupData>;
  stats: SlaStats;
  acknowledgedDelays: ActiveDelay[];
  snapshotDate: string | null;
}

interface DelayTarget {
  claimId: string;
  secondaryStatus: string;
}

const PRIORITY_ORDER: Record<string, number> = { critical: 0, urgent: 1, standard: 2 };

export default function SlaPage() {
  const [data, setData] = useState<SlaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [delayTarget, setDelayTarget] = useState<DelayTarget | null>(null);

  function loadData() {
    setLoading(true);
    fetch('/api/sla')
      .then(r => r.json())
      .then((d: SlaData) => {
        setData(d);
        // Auto-expand all sections
        setExpanded(new Set(Object.keys(d.grouped)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-sm text-[#6B7280]">Loading SLA watchlist...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
        <p className="text-sm text-[#6B7280]">Failed to load SLA data.</p>
      </div>
    );
  }

  const delayMap = new Map<string, ActiveDelay>();
  for (const d of data.acknowledgedDelays) {
    delayMap.set(d.claimId, d);
  }

  const sortedGroups = Object.entries(data.grouped).sort(
    ([, a], [, b]) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
  );

  function toggleGroup(status: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">SLA Watchlist</h1>
        {data.snapshotDate && (
          <p className="text-sm text-[#6B7280] mt-1">
            Snapshot: {formatDate(data.snapshotDate)} · {data.stats.total} breaches
          </p>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Breaches"
          value={data.stats.total}
          variant={data.stats.total > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Critical"
          value={data.stats.critical}
          variant={data.stats.critical > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Urgent"
          value={data.stats.urgent}
          variant={data.stats.urgent > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Standard"
          value={data.stats.standard}
          variant="default"
        />
      </div>

      {/* Grouped sections */}
      {sortedGroups.length === 0 ? (
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <div className="w-12 h-12 rounded-full bg-[#065F46]/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-[#065F46]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-[#065F46] mb-1">All Clear</h2>
          <p className="text-sm text-[#6B7280]">No SLA breaches in the current snapshot.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedGroups.map(([status, group]) => {
            const priority = group.priority as SlaPriority;
            const isOpen = expanded.has(status);

            return (
              <div
                key={status}
                className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
              >
                {/* Section header */}
                <button
                  onClick={() => toggleGroup(status)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 hover:bg-[#F4F6FA] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <SlaBadge priority={priority} />
                    <span className="text-sm font-semibold text-[#0D2761]">{status}</span>
                    <span className="text-xs text-[#6B7280]">SLA: {group.maxDays} days</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#E8EEF8] text-[#6B7280]">
                      {group.claims.length} claim{group.claims.length !== 1 ? 's' : ''}
                    </span>
                    <svg
                      className={`w-4 h-4 text-[#6B7280] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </button>

                {/* Claims rows */}
                {isOpen && (
                  <div className="border-t border-[#E8EEF8]">
                    {group.claims.map((claim, idx) => {
                      const activeDelay = delayMap.get(claim.claimId);
                      return (
                        <div
                          key={claim.id}
                          className={`flex items-center justify-between gap-4 px-4 py-3 ${
                            idx < group.claims.length - 1 ? 'border-b border-[#E8EEF8]' : ''
                          }`}
                        >
                          <div className="flex items-center gap-4 min-w-0 flex-1">
                            <a
                              href={`/claims/${encodeURIComponent(claim.claimId)}`}
                              className="font-mono text-sm font-medium text-[#0D2761] hover:underline flex-shrink-0"
                            >
                              {claim.claimId}
                            </a>
                            <span className="text-sm text-[#6B7280] truncate">
                              {claim.handler ?? 'Unassigned'}
                            </span>
                            {claim.insured && (
                              <span className="text-sm text-[#6B7280] truncate hidden lg:block">
                                {claim.insured.length > 25 ? `${claim.insured.slice(0, 25)}…` : claim.insured}
                              </span>
                            )}
                            {claim.daysInCurrentStatus != null && (
                              <span className="text-xs text-[#6B7280] flex-shrink-0">
                                {claim.daysInCurrentStatus} days
                              </span>
                            )}
                            {activeDelay && (
                              <Badge variant="warning" className="flex-shrink-0">
                                Delay: {activeDelay.reasonType.slice(0, 20)}{activeDelay.reasonType.length > 20 ? '…' : ''}
                              </Badge>
                            )}
                          </div>
                          <button
                            onClick={() => setDelayTarget({
                              claimId: claim.claimId,
                              secondaryStatus: claim.secondaryStatus ?? '',
                            })}
                            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-[#0D2761] border border-[#0D2761] rounded-lg hover:bg-[#0D2761] hover:text-white transition-colors"
                          >
                            Log Delay
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Acknowledged Delay Modal */}
      {delayTarget && (
        <AcknowledgedDelayModal
          claimId={delayTarget.claimId}
          secondaryStatus={delayTarget.secondaryStatus}
          onClose={() => setDelayTarget(null)}
          onSuccess={() => {
            setDelayTarget(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
