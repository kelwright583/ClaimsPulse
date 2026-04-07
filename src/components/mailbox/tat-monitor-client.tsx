'use client';

import { useEffect, useState, useCallback } from 'react';
import { Clock, CheckCircle } from 'lucide-react';

interface EmailRecord {
  id: string;
  mailboxId: string;
  graphEmailId: string;
  subject: string | null;
  categoryName: string | null;
  senderType: string | null;
  assignedToEmail: string | null;
  receivedAt: string;
  tatDeadline: string;
  respondedTo: boolean;
  claimId: string | null;
}

type TatStatus = 'On Track' | 'At Risk' | 'Breached';

function getTatStatus(deadline: string): TatStatus {
  const now = Date.now();
  const dl = new Date(deadline).getTime();
  const diff = dl - now;
  if (diff < 0) return 'Breached';
  if (diff < 2 * 60 * 60 * 1000) return 'At Risk'; // < 2 hours
  return 'On Track';
}

function StatusBadge({ status }: { status: TatStatus }) {
  const colours: Record<TatStatus, string> = {
    'On Track': 'bg-green-100 text-green-700',
    'At Risk': 'bg-amber-100 text-amber-700',
    'Breached': 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${colours[status]}`}>
      {status}
    </span>
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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function TatMonitorClient() {
  const [records, setRecords] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch all unresponded records with deadlines
      const resp = await fetch('/api/mailbox/tat');
      if (!resp.ok) throw new Error(`Failed: ${resp.status}`);
      const json = await resp.json() as EmailRecord[];
      setRecords(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRecords(); }, [fetchRecords]);

  async function markResponded(id: string) {
    setMarking(id);
    try {
      await fetch('/api/mailbox/tat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailRecordId: id }),
      });
      await fetchRecords();
    } finally {
      setMarking(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0D2761]">TAT Monitor</h1>
        <p className="text-sm text-[#6B7280]">Turnaround time tracking for all pending emails</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-[#6B7280] text-sm">Loading…</div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-[#6B7280]">
            <Clock className="w-8 h-8 opacity-30" />
            <span className="text-sm">No pending emails — all within TAT.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#6B7280] border-b border-[#E8EEF8] bg-[#F4F6FA]">
                  <th className="text-left px-4 py-3 font-medium">Subject</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Sender type</th>
                  <th className="text-left px-4 py-3 font-medium">Assigned to</th>
                  <th className="text-left px-4 py-3 font-medium">Received</th>
                  <th className="text-left px-4 py-3 font-medium">Deadline</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {records.map(row => {
                  const status = getTatStatus(row.tatDeadline);
                  return (
                    <tr key={row.id} className="border-b border-[#E8EEF8] hover:bg-[#F4F6FA] transition-colors">
                      <td className="px-4 py-2.5 text-[#0D2761] max-w-[200px] truncate">
                        {row.subject ?? '(no subject)'}
                      </td>
                      <td className="px-4 py-2.5"><CategoryBadge name={row.categoryName} /></td>
                      <td className="px-4 py-2.5 capitalize text-[#6B7280]">{row.senderType ?? '—'}</td>
                      <td className="px-4 py-2.5 text-[#6B7280]">{row.assignedToEmail ?? '—'}</td>
                      <td className="px-4 py-2.5 text-[#6B7280] whitespace-nowrap">{formatDateTime(row.receivedAt)}</td>
                      <td className="px-4 py-2.5 text-[#6B7280] whitespace-nowrap">{formatDateTime(row.tatDeadline)}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={status} /></td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => void markResponded(row.id)}
                          disabled={marking === row.id}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-green-600 text-white rounded-md text-[10px] font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" strokeWidth={2} />
                          {marking === row.id ? 'Saving…' : 'Mark responded'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
