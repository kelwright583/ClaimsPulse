'use client';

import { useEffect, useState } from 'react';

interface ImportRun {
  id: string;
  reportType: string;
  filename: string;
  uploaderName: string | null;
  rowsRead: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsErrored: number;
  createdAt: string;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  CLAIMS_OUTSTANDING: 'Claims Outstanding',
  PAYEE: 'Payee Data',
  REVENUE_ANALYSIS: 'Revenue Analysis',
  MOVEMENT_SUMMARY: 'Movement Summary',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ errored }: { errored: number }) {
  if (errored === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#065F46]/10 text-[#065F46] text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-[#065F46]" />
        Success
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#92400E]/10 text-[#92400E] text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-[#92400E]" />
      {errored} error{errored !== 1 ? 's' : ''}
    </span>
  );
}

export function ImportHistory() {
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = () => {
    setLoading(true);
    fetch('/api/import/history')
      .then(r => r.json())
      .then((data: ImportRun[]) => {
        setRuns(Array.isArray(data) ? data : []);
      })
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadHistory();
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-[#E8EEF8] bg-white p-6">
        <p className="text-sm text-[#6B7280] text-center">Loading history...</p>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-[#E8EEF8] bg-white p-6">
        <p className="text-sm text-[#6B7280] text-center">No imports yet. Upload your first report above.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#E8EEF8] bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E8EEF8] bg-[#F4F6FA]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[#F5A800] whitespace-nowrap">Report Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#F5A800] whitespace-nowrap">Filename</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#F5A800] whitespace-nowrap">Date / Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#F5A800] whitespace-nowrap">Uploaded By</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[#F5A800] whitespace-nowrap">Rows Read</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[#F5A800] whitespace-nowrap">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[#F5A800] whitespace-nowrap">Updated</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#F5A800] whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8EEF8]">
            {runs.map(run => (
              <tr key={run.id} className="hover:bg-[#F4F6FA]/50 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#0D2761]/8 text-[#0D2761]">
                    {REPORT_TYPE_LABELS[run.reportType] ?? run.reportType}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-[200px]">
                  <span className="text-[#0D2761] text-xs truncate block" title={run.filename}>
                    {run.filename}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[#6B7280] whitespace-nowrap">
                  {formatDate(run.createdAt)}
                </td>
                <td className="px-4 py-3 text-xs text-[#6B7280] whitespace-nowrap">
                  {run.uploaderName ?? '—'}
                </td>
                <td className="px-4 py-3 text-right text-xs text-[#0D2761] font-medium">
                  {run.rowsRead.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-xs text-[#065F46] font-medium">
                  {run.rowsCreated.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-xs text-[#0D2761] font-medium">
                  {run.rowsUpdated.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge errored={run.rowsErrored} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
