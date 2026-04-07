'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface AuditLog {
  id: string;
  timestamp: string;
  categoryName: string | null;
  senderType: string | null;
  subject: string | null;
  reasoning: string | null;
  actionTaken: string | null;
  confidence: number | null;
  assignedTo: string | null;
  claimId: string | null;
  urgent: boolean;
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
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
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

const PAGE_SIZE = 50;

export function AuditLogClient() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [urgentOnly, setUrgentOnly] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '500' });
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (categoryFilter) params.set('categoryName', categoryFilter);
      if (urgentOnly) params.set('urgent', 'true');

      const resp = await fetch(`/api/mailbox/audit?${params.toString()}`);
      if (!resp.ok) throw new Error(`Failed: ${resp.status}`);
      const json = await resp.json() as AuditLog[];
      setLogs(json);
      setPage(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, categoryFilter, urgentOnly]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  const pageCount = Math.ceil(logs.length / PAGE_SIZE);
  const pageLogs = logs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0D2761]">Audit Log</h1>
        <p className="text-sm text-[#6B7280]">Full history of all classified and routed emails</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="border border-[#E8EEF8] rounded-lg px-3 py-1.5 text-sm text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">To</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="border border-[#E8EEF8] rounded-lg px-3 py-1.5 text-sm text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Category</label>
          <input
            type="text"
            placeholder="Filter by category…"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="border border-[#E8EEF8] rounded-lg px-3 py-1.5 text-sm text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6] w-48"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={urgentOnly}
            onChange={e => setUrgentOnly(e.target.checked)}
            className="w-4 h-4 accent-[#1E5BC6]"
          />
          <span className="text-sm text-[#0D2761]">Urgent only</span>
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-[#6B7280] text-sm">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-[#6B7280] text-sm">No records found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[#6B7280] border-b border-[#E8EEF8] bg-[#F4F6FA]">
                    <th className="text-left px-4 py-3 font-medium">Timestamp</th>
                    <th className="text-left px-4 py-3 font-medium">Category</th>
                    <th className="text-left px-4 py-3 font-medium">Sender type</th>
                    <th className="text-left px-4 py-3 font-medium">Subject</th>
                    <th className="text-left px-4 py-3 font-medium">Reasoning</th>
                    <th className="text-left px-4 py-3 font-medium">Action taken</th>
                    <th className="text-left px-4 py-3 font-medium">Confidence</th>
                    <th className="text-left px-4 py-3 font-medium">Assignee</th>
                    <th className="text-left px-4 py-3 font-medium">Claim ID</th>
                    <th className="text-left px-4 py-3 font-medium">Urgent</th>
                  </tr>
                </thead>
                <tbody>
                  {pageLogs.map(row => (
                    <tr key={row.id} className="border-b border-[#E8EEF8] hover:bg-[#F4F6FA] transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap text-[#6B7280]">{formatDateTime(row.timestamp)}</td>
                      <td className="px-4 py-2.5"><CategoryBadge name={row.categoryName} /></td>
                      <td className="px-4 py-2.5 capitalize text-[#6B7280]">{row.senderType ?? '—'}</td>
                      <td className="px-4 py-2.5 text-[#0D2761] max-w-[160px] truncate">{row.subject ?? '—'}</td>
                      <td className="px-4 py-2.5 text-[#6B7280] max-w-[220px] truncate" title={row.reasoning ?? ''}>{row.reasoning ?? '—'}</td>
                      <td className="px-4 py-2.5 text-[#6B7280]">{row.actionTaken ?? '—'}</td>
                      <td className="px-4 py-2.5 text-[#6B7280]">
                        {row.confidence != null ? `${Math.round(Number(row.confidence) * 100)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-[#6B7280]">{row.assignedTo ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        {row.claimId ? (
                          <Link href={`/claims?claimId=${row.claimId}`} className="text-[#1E5BC6] underline hover:text-[#0D2761]">
                            {row.claimId}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5"><UrgentBadge urgent={row.urgent} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pageCount > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#E8EEF8]">
                <span className="text-xs text-[#6B7280]">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, logs.length)} of {logs.length}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 text-xs border border-[#E8EEF8] rounded-lg text-[#0D2761] disabled:opacity-40 hover:bg-[#F4F6FA] transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                    disabled={page >= pageCount - 1}
                    className="px-3 py-1.5 text-xs border border-[#E8EEF8] rounded-lg text-[#0D2761] disabled:opacity-40 hover:bg-[#F4F6FA] transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
