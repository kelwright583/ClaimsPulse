'use client';

import { useEffect, useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

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
  CLAIMS_REGISTER: 'Claims Register',
  BUDGET: 'Annual Budget',
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

interface DeleteModalProps {
  run: ImportRun;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

function DeleteModal({ run, onConfirm, onCancel, isDeleting }: DeleteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-base font-bold text-[#0D2761] mb-2">Delete this import?</h2>
        <p className="text-sm text-[#6B7280] mb-1">
          <span className="font-medium text-[#0D2761]">{run.filename}</span>
        </p>
        <p className="text-sm text-[#6B7280] mb-4 leading-relaxed">
          This will permanently delete all snapshots, flags, and payments for this import.
          If later imports exist, their derived data will be recomputed. This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-[#6B7280] hover:text-[#0D2761] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ImportHistory() {
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<ImportRun | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { showToast } = useToast();

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

  async function handleDeleteConfirm() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/import/${pendingDelete.id}`, { method: 'DELETE' });
      if (res.status === 404) {
        showToast('This import was already deleted.', 'info');
        setPendingDelete(null);
        loadHistory();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast((body as { error?: string }).error ?? 'Failed to delete import.', 'error');
        return;
      }
      showToast('Import deleted successfully.', 'success');
      setPendingDelete(null);
      loadHistory();
    } catch {
      showToast('Failed to delete import. Please try again.', 'error');
    } finally {
      setIsDeleting(false);
    }
  }

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
    <>
      {pendingDelete && (
        <DeleteModal
          run={pendingDelete}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setPendingDelete(null)}
          isDeleting={isDeleting}
        />
      )}

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
                <th className="px-4 py-3 text-right text-xs font-medium text-[#F5A800] whitespace-nowrap">Actions</th>
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
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setPendingDelete(run)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                      aria-label={`Delete import ${run.filename}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
