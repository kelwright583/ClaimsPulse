'use client';

import { useState, useCallback, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { BackButton } from '@/components/ui/back-button';
import type { UserRole } from '@/types/roles';

interface SnapshotData {
  generatedAt: string;
  snapshotDate: string | null;
  claims: {
    openCount: number;
    tatBreaches: number;
    partsBackorder: number;
    bigClaims: number;
    totalOutstanding: number;
    finalisedToday: number;
  };
  payments: { count: number; totalValue: number };
  mailbox: { emailsRouted: number; tatBreaches: number; urgentPending: number };
  finance: { lossRatio: number | null };
  operations: {
    activeProjects: number;
    overdueMilestones: { title: string; projectTitle: string; dueDate: string; daysOverdue: number }[];
    dueSoonMilestones: { title: string; projectTitle: string; dueDate: string; daysUntilDue: number }[];
  };
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString()}`;
}

function lrVariant(lr: number | null): 'default' | 'success' | 'warning' | 'danger' {
  if (lr === null) return 'default';
  if (lr <= 60) return 'success';
  if (lr <= 70) return 'warning';
  return 'danger';
}

export function SnapshotClient({ role: _role }: { role: UserRole }) {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/operations/snapshot');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-5 py-4 text-sm text-[#991B1B]">
        Failed to load snapshot: {error}
      </div>
    );
  }

  return (
    <div>
      <BackButton label="Back to Operations" href="/operations" />
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0D2761]">Daily Snapshot</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">
            {data?.snapshotDate
              ? `Claims data as of ${new Date(data.snapshotDate).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}`
              : 'Live summary across all pillars'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.generatedAt && (
            <span className="text-xs text-[#6B7280]">
              Generated at {new Date(data.generatedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#E8EEF8] text-[#0D2761] hover:border-[#1E5BC6] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
            Refresh
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-[#F4F6FA] rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {data && (
        <div className="space-y-8">
          {/* Claims health */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-3">Claims health</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard label="Open claims" value={data.claims.openCount} />
              <StatCard label="TAT breaches" value={data.claims.tatBreaches} variant={data.claims.tatBreaches > 0 ? 'danger' : 'default'} />
              <StatCard label="Parts backorder" value={data.claims.partsBackorder} variant={data.claims.partsBackorder > 0 ? 'warning' : 'default'} />
              <StatCard label="Big claims (R250k+)" value={data.claims.bigClaims} />
              <StatCard label="Total outstanding" value={fmt(data.claims.totalOutstanding)} />
            </div>
          </section>

          {/* Payments */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-3">Payments (last 24h)</h2>
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              <StatCard label="Payments processed" value={data.payments.count} />
              <StatCard label="Total value paid" value={fmt(data.payments.totalValue)} />
            </div>
          </section>

          {/* Mailbox */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-3">Mailbox (last 24h)</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg">
              <StatCard label="Emails routed" value={data.mailbox.emailsRouted} />
              <StatCard label="TAT breaches" value={data.mailbox.tatBreaches} variant={data.mailbox.tatBreaches > 0 ? 'danger' : 'default'} />
              <StatCard label="Urgent pending" value={data.mailbox.urgentPending} variant={data.mailbox.urgentPending > 0 ? 'warning' : 'default'} />
            </div>
          </section>

          {/* Finance */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-3">Financial position</h2>
            <div className="max-w-[180px]">
              {data.finance.lossRatio === null ? (
                <StatCard label="Net loss ratio (MTD)" value="No data" sub="No premium data yet" />
              ) : (
                <StatCard
                  label="Net loss ratio (MTD)"
                  value={`${data.finance.lossRatio}%`}
                  sub="Target: 65%"
                  variant={lrVariant(data.finance.lossRatio)}
                />
              )}
            </div>
          </section>

          {/* Operations */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-3">Operations</h2>
            <div className="max-w-[180px] mb-4">
              <StatCard label="Active projects" value={data.operations.activeProjects} />
            </div>

            {data.operations.overdueMilestones.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-[#991B1B] mb-2">Overdue milestones</p>
                <div className="flex flex-wrap gap-2">
                  {data.operations.overdueMilestones.map((m, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#FEF2F2] text-[#991B1B] border border-[#FCA5A5]"
                    >
                      <span className="font-semibold">{m.projectTitle}</span>
                      <span className="opacity-70">·</span>
                      {m.title}
                      <span className="opacity-70">·</span>
                      {m.daysOverdue}d overdue
                    </span>
                  ))}
                </div>
              </div>
            )}

            {data.operations.dueSoonMilestones.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#92400E] mb-2">Due this week</p>
                <div className="flex flex-wrap gap-2">
                  {data.operations.dueSoonMilestones.map((m, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#FFFBEB] text-[#92400E] border border-[#FCD34D]"
                    >
                      <span className="font-semibold">{m.projectTitle}</span>
                      <span className="opacity-70">·</span>
                      {m.title}
                      <span className="opacity-70">·</span>
                      {m.daysUntilDue === 0 ? 'today' : `${m.daysUntilDue}d`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {data.operations.overdueMilestones.length === 0 && data.operations.dueSoonMilestones.length === 0 && (
              <p className="text-sm text-[#6B7280]">No overdue or upcoming milestones this week.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
