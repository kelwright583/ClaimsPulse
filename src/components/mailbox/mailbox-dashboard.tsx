'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, Mail, Shield, RefreshCw } from 'lucide-react';

interface MailboxStats {
  totalProcessed: number;
  pendingResponse: number;
  tatBreaches: number;
  urgentPending: number;
}

interface PendingTat {
  id: string;
  graphEmailId: string;
  subject: string | null;
  categoryName: string | null;
  urgent: boolean;
  receivedAt: string;
  tatDeadline: string;
  overdueMinutes?: number;
}

interface RecentActivity {
  id: string;
  timestamp: string;
  categoryName: string | null;
  senderType: string | null;
  subject: string | null;
  reasoning: string | null;
  actionTaken: string | null;
  confidence: number | null;
  urgent: boolean;
  claimId: string | null;
}

interface DashboardData {
  recentActivity: RecentActivity[];
  pendingTat: PendingTat[];
  stats: MailboxStats;
  isConfigured: boolean;
  isStubMode: boolean;
}

function StatCard({
  label,
  value,
  icon: Icon,
  colour,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  colour: string;
}) {
  return (
    <div className="bg-white border border-[#E8EEF8] rounded-xl p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${colour}`}>
        <Icon className="w-5 h-5 text-white" strokeWidth={2} />
      </div>
      <div>
        <div className="text-2xl font-bold text-[#0D2761]">{value.toLocaleString()}</div>
        <div className="text-xs text-[#6B7280]">{label}</div>
      </div>
    </div>
  );
}

function CategoryBadge({ name }: { name: string | null }) {
  if (!name) return <span className="text-[#6B7280] text-xs">—</span>;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EEF3FC] text-[#1E5BC6]">
      {name}
    </span>
  );
}

function UrgentBadge({ urgent }: { urgent: boolean }) {
  if (!urgent) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 ml-1">
      Urgent
    </span>
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function overdueText(deadline: string) {
  const diff = Math.floor((Date.now() - new Date(deadline).getTime()) / 60000);
  if (diff < 60) return `${diff}m overdue`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m overdue`;
}

export function MailboxDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const resp = await fetch('/api/mailbox/dashboard');
      if (!resp.ok) throw new Error(`Failed to load: ${resp.status}`);
      const json = await resp.json() as DashboardData;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  async function handlePoll() {
    setPolling(true);
    try {
      await fetch('/api/mailbox/poll', { method: 'POST' });
      await fetchData();
    } finally {
      setPolling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#6B7280]">
        Loading mailbox dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0D2761]">Inbox Routing</h1>
          <p className="text-sm text-[#6B7280]">Mailbox triage and routing activity</p>
        </div>
        <button
          onClick={() => void handlePoll()}
          disabled={polling}
          className="flex items-center gap-2 px-4 py-2 bg-[#1E5BC6] text-white text-sm font-medium rounded-lg hover:bg-[#0D2761] disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${polling ? 'animate-spin' : ''}`} strokeWidth={2} />
          {polling ? 'Polling…' : 'Poll mailbox now'}
        </button>
      </div>

      {/* Stub mode banner */}
      {data.isStubMode && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <AlertTriangle className="w-5 h-5 text-[#F5A800] flex-shrink-0" strokeWidth={2} />
          <div className="flex-1 text-sm text-amber-800">
            <span className="font-semibold">Mailbox not connected.</span> You are viewing stub data.
            {' '}
            <Link href="/mailbox/setup" className="underline font-medium hover:text-amber-900">
              Configure your mailbox connection →
            </Link>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total processed" value={data.stats.totalProcessed} icon={Mail} colour="bg-[#1E5BC6]" />
        <StatCard label="Pending response" value={data.stats.pendingResponse} icon={Clock} colour="bg-amber-500" />
        <StatCard label="TAT breaches" value={data.stats.tatBreaches} icon={AlertTriangle} colour="bg-red-500" />
        <StatCard label="Urgent pending" value={data.stats.urgentPending} icon={Shield} colour="bg-[#0D2761]" />
      </div>

      {/* TAT watchlist */}
      {data.pendingTat.length > 0 && (
        <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-red-50 border-b border-red-100">
            <h2 className="text-sm font-semibold text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" strokeWidth={2} />
              TAT Watchlist — {data.pendingTat.length} overdue
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#6B7280] border-b border-[#E8EEF8]">
                  <th className="text-left px-4 py-2.5 font-medium">Subject</th>
                  <th className="text-left px-4 py-2.5 font-medium">Category</th>
                  <th className="text-left px-4 py-2.5 font-medium">Urgent</th>
                  <th className="text-left px-4 py-2.5 font-medium">Received</th>
                  <th className="text-left px-4 py-2.5 font-medium">Deadline</th>
                  <th className="text-left px-4 py-2.5 font-medium">Overdue by</th>
                </tr>
              </thead>
              <tbody>
                {data.pendingTat.map(row => (
                  <tr key={row.id} className="border-b border-[#E8EEF8] hover:bg-red-50 transition-colors">
                    <td className="px-4 py-2.5 text-[#0D2761] max-w-[220px] truncate">
                      {row.subject ?? '(no subject)'}
                    </td>
                    <td className="px-4 py-2.5"><CategoryBadge name={row.categoryName} /></td>
                    <td className="px-4 py-2.5"><UrgentBadge urgent={row.urgent} /></td>
                    <td className="px-4 py-2.5 text-[#6B7280]">{formatDateTime(row.receivedAt)}</td>
                    <td className="px-4 py-2.5 text-[#6B7280]">{formatDateTime(row.tatDeadline)}</td>
                    <td className="px-4 py-2.5 font-semibold text-red-600">{overdueText(row.tatDeadline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent routing activity */}
      <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E8EEF8]">
          <h2 className="text-sm font-semibold text-[#0D2761]">Recent Routing Activity</h2>
        </div>
        {data.recentActivity.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[#6B7280]">
            No email activity yet. Click "Poll mailbox now" to fetch emails.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#6B7280] border-b border-[#E8EEF8]">
                  <th className="text-left px-4 py-2.5 font-medium">Timestamp</th>
                  <th className="text-left px-4 py-2.5 font-medium">Category</th>
                  <th className="text-left px-4 py-2.5 font-medium">Sender type</th>
                  <th className="text-left px-4 py-2.5 font-medium">Subject</th>
                  <th className="text-left px-4 py-2.5 font-medium">AI reasoning</th>
                  <th className="text-left px-4 py-2.5 font-medium">Action taken</th>
                  <th className="text-left px-4 py-2.5 font-medium">Confidence</th>
                  <th className="text-left px-4 py-2.5 font-medium">Urgent</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActivity.map(row => (
                  <tr key={row.id} className="border-b border-[#E8EEF8] hover:bg-[#F4F6FA] transition-colors">
                    <td className="px-4 py-2.5 text-[#6B7280] whitespace-nowrap">{formatDateTime(row.timestamp)}</td>
                    <td className="px-4 py-2.5"><CategoryBadge name={row.categoryName} /></td>
                    <td className="px-4 py-2.5 text-[#6B7280] capitalize">{row.senderType ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[#0D2761] max-w-[180px] truncate">{row.subject ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[#6B7280] max-w-[240px] truncate" title={row.reasoning ?? ''}>{row.reasoning ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[#6B7280]">{row.actionTaken ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[#6B7280]">
                      {row.confidence != null ? `${Math.round(Number(row.confidence) * 100)}%` : '—'}
                    </td>
                    <td className="px-4 py-2.5"><UrgentBadge urgent={row.urgent} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
