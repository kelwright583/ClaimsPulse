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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0F6E56]/10 text-[#0F6E56] text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-[#0F6E56]" />
        Success
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#854F0B]/10 text-[#854F0B] text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-[#854F0B]" />
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
      <div className="rounded-lg border border-[#D3D1C7] bg-white p-6">
        <p className="text-sm text-[#5F5E5A] text-center">Loading history...</p>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-[#D3D1C7] bg-white p-6">
        <p className="text-sm text-[#5F5E5A] text-center">No imports yet. Upload your first report above.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#D3D1C7] bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#D3D1C7] bg-[#F7F6F2]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[#5F5E5A] whitespace-nowrap">Report Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#5F5E5A] whitespace-nowrap">Filename</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#5F5E5A] whitespace-nowrap">Date / Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#5F5E5A] whitespace-nowrap">Uploaded By</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[#5F5E5A] whitespace-nowrap">Rows Read</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[#5F5E5A] whitespace-nowrap">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[#5F5E5A] whitespace-nowrap">Updated</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#5F5E5A] whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D3D1C7]">
            {runs.map(run => (
              <tr key={run.id} className="hover:bg-[#F7F6F2]/50 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#1B3A5C]/8 text-[#1B3A5C]">
                    {REPORT_TYPE_LABELS[run.reportType] ?? run.reportType}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-[200px]">
                  <span className="text-[#2C2C2A] text-xs truncate block" title={run.filename}>
                    {run.filename}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[#5F5E5A] whitespace-nowrap">
                  {formatDate(run.createdAt)}
                </td>
                <td className="px-4 py-3 text-xs text-[#5F5E5A] whitespace-nowrap">
                  {run.uploaderName ?? '—'}
                </td>
                <td className="px-4 py-3 text-right text-xs text-[#2C2C2A] font-medium">
                  {run.rowsRead.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-xs text-[#0F6E56] font-medium">
                  {run.rowsCreated.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-xs text-[#1B3A5C] font-medium">
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
