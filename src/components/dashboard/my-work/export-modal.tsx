'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Download,
  Loader2,
  Users,
  User,
  CheckSquare,
  Square,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentHandler: string;
  role: string;
}

interface ExportProgress {
  handler: string;
  status: 'pending' | 'downloading' | 'done' | 'error';
  error?: string;
}

async function downloadFile(
  handler: string | null,
  handlers: string[] | null,
  reportType: 'individual' | 'group',
): Promise<string> {
  const body =
    reportType === 'group'
      ? { handlers, reportType }
      : { handler, reportType };

  const res = await fetch('/api/dashboard/my-work/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Export failed' }));
    throw new Error((err as { error: string }).error ?? 'Export failed');
  }

  const filename =
    res.headers.get('X-Filename') ??
    (reportType === 'group'
      ? `Group_Report_${new Date().toISOString().split('T')[0]}.xlsx`
      : `${(handler ?? 'Handler').replace(/\s+/g, '_')}_Daily_Report_${new Date().toISOString().split('T')[0]}.xlsx`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return filename;
}

export function ExportModal({ isOpen, onClose, currentHandler, role }: ExportModalProps) {
  const [handlers, setHandlers] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reportType, setReportType] = useState<'individual' | 'group'>('individual');
  const [fetching, setFetching] = useState(false);
  const [progress, setProgress] = useState<ExportProgress[]>([]);
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);

  const canSelectMultiple =
    role === 'HEAD_OF_CLAIMS' || role === 'TEAM_LEADER' || role === 'SENIOR_MANAGEMENT';

  // Load handler list
  useEffect(() => {
    if (!isOpen) return;
    setFetching(true);
    setProgress([]);
    setDone(false);

    fetch('/api/dashboard/my-work/action-list?handler=__all__')
      .then((r) => r.json())
      .then((data: { handlers?: string[] }) => {
        const list = data.handlers ?? [];
        setHandlers(list);
        // Pre-select current handler (or all for managers)
        if (!canSelectMultiple) {
          setSelected(new Set([currentHandler]));
        } else {
          const initial = currentHandler && currentHandler !== '__all__'
            ? new Set([currentHandler])
            : new Set(list);
          setSelected(initial);
        }
      })
      .catch(() => {
        setHandlers([]);
      })
      .finally(() => setFetching(false));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleHandler = useCallback((name: string) => {
    if (!canSelectMultiple) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, [canSelectMultiple]);

  const selectAll = useCallback(() => setSelected(new Set(handlers)), [handlers]);
  const selectNone = useCallback(() => setSelected(new Set()), []);

  const handleExport = useCallback(async () => {
    if (selected.size === 0) return;
    setExporting(true);
    setDone(false);

    const selectedList = [...selected];

    if (reportType === 'group') {
      // One combined file
      setProgress([{ handler: 'Group Report', status: 'downloading' }]);
      try {
        await downloadFile(null, selectedList, 'group');
        setProgress([{ handler: 'Group Report', status: 'done' }]);
      } catch (e) {
        setProgress([{ handler: 'Group Report', status: 'error', error: (e as Error).message }]);
      }
      setDone(true);
      setExporting(false);
    } else {
      // Individual file per person
      const initialProgress: ExportProgress[] = selectedList.map((h) => ({
        handler: h,
        status: 'pending',
      }));
      setProgress(initialProgress);

      for (let i = 0; i < selectedList.length; i++) {
        const h = selectedList[i];
        setProgress((prev) =>
          prev.map((p) => (p.handler === h ? { ...p, status: 'downloading' } : p)),
        );
        try {
          await downloadFile(h, null, 'individual');
          setProgress((prev) =>
            prev.map((p) => (p.handler === h ? { ...p, status: 'done' } : p)),
          );
        } catch (e) {
          setProgress((prev) =>
            prev.map((p) =>
              p.handler === h ? { ...p, status: 'error', error: (e as Error).message } : p,
            ),
          );
        }
        // Small delay to avoid browser download blocking
        if (i < selectedList.length - 1) {
          await new Promise((res) => setTimeout(res, 600));
        }
      }

      setDone(true);
      setExporting(false);
    }
  }, [selected, reportType]);

  if (!isOpen) return null;

  const allSelected = handlers.length > 0 && selected.size === handlers.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={!exporting ? onClose : undefined}
      />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#0D2761] px-6 py-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 rounded-lg p-2">
              <FileSpreadsheet className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">Export Daily Reports</h2>
              <p className="text-white/60 text-xs mt-0.5">
                Excel workbook · 5 sheets per report
              </p>
            </div>
          </div>
          {!exporting && (
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
            >
              <X className="w-5 h-5" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Report type toggle */}
          {canSelectMultiple && !exporting && !done && (
            <div className="px-6 pt-5 pb-4 border-b border-[#E8EEF8]">
              <p className="text-xs font-semibold text-[#0D2761] uppercase tracking-wider mb-3">
                Report format
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setReportType('individual')}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-left ${
                    reportType === 'individual'
                      ? 'border-[#1E5BC6] bg-[#EEF2FF]'
                      : 'border-[#E8EEF8] hover:border-[#1E5BC6]/40'
                  }`}
                >
                  <User
                    className={`w-5 h-5 flex-shrink-0 ${
                      reportType === 'individual' ? 'text-[#1E5BC6]' : 'text-[#6B7280]'
                    }`}
                    strokeWidth={2}
                  />
                  <div>
                    <p
                      className={`text-sm font-semibold ${
                        reportType === 'individual' ? 'text-[#0D2761]' : 'text-[#374151]'
                      }`}
                    >
                      Individual
                    </p>
                    <p className="text-[10px] text-[#6B7280] leading-tight">
                      One file per person
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => setReportType('group')}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-left ${
                    reportType === 'group'
                      ? 'border-[#1E5BC6] bg-[#EEF2FF]'
                      : 'border-[#E8EEF8] hover:border-[#1E5BC6]/40'
                  }`}
                >
                  <Users
                    className={`w-5 h-5 flex-shrink-0 ${
                      reportType === 'group' ? 'text-[#1E5BC6]' : 'text-[#6B7280]'
                    }`}
                    strokeWidth={2}
                  />
                  <div>
                    <p
                      className={`text-sm font-semibold ${
                        reportType === 'group' ? 'text-[#0D2761]' : 'text-[#374151]'
                      }`}
                    >
                      Group
                    </p>
                    <p className="text-[10px] text-[#6B7280] leading-tight">
                      One combined file
                    </p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Sheets info strip */}
          {!exporting && !done && (
            <div className="px-6 pt-4 pb-3 border-b border-[#E8EEF8]">
              <p className="text-xs font-semibold text-[#0D2761] uppercase tracking-wider mb-2">
                Included sheets
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'Monthly Delta', color: 'bg-sky-100 text-sky-700' },
                  { label: "Today's Action Items", color: 'bg-blue-100 text-blue-700' },
                  { label: 'Assessor Appointed', color: 'bg-teal-100 text-teal-700' },
                  { label: 'My Portfolio', color: 'bg-indigo-100 text-indigo-700' },
                  { label: 'Pending Finalisation', color: 'bg-purple-100 text-purple-700' },
                ].map(({ label, color }) => (
                  <div key={label} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${color}`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Handler selection */}
          {!exporting && !done && (
            <div className="px-6 pt-4 pb-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-[#0D2761] uppercase tracking-wider">
                  Select handlers
                  {canSelectMultiple && selected.size > 0 && (
                    <span className="ml-2 text-[#1E5BC6] font-bold">{selected.size} selected</span>
                  )}
                </p>
                {canSelectMultiple && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={selectAll}
                      className="text-xs text-[#1E5BC6] hover:text-[#0D2761] font-medium"
                    >
                      All
                    </button>
                    <span className="text-[#E8EEF8]">·</span>
                    <button
                      onClick={selectNone}
                      className="text-xs text-[#6B7280] hover:text-[#0D2761] font-medium"
                    >
                      None
                    </button>
                  </div>
                )}
              </div>

              {fetching ? (
                <div className="flex items-center justify-center py-8 gap-2 text-[#6B7280] text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                  Loading handlers…
                </div>
              ) : handlers.length === 0 ? (
                <p className="text-sm text-[#6B7280] py-4 text-center">No handlers available.</p>
              ) : (
                <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                  {handlers.map((h) => {
                    const isSel = selected.has(h);
                    const isCurrent = h === currentHandler;
                    return (
                      <button
                        key={h}
                        onClick={() => toggleHandler(h)}
                        disabled={!canSelectMultiple}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                          isSel
                            ? 'bg-[#EEF2FF] border-[#1E5BC6]'
                            : 'bg-white border-[#E8EEF8] hover:border-[#1E5BC6]/40'
                        } ${!canSelectMultiple ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        {canSelectMultiple ? (
                          isSel ? (
                            <CheckSquare
                              className="w-4 h-4 text-[#1E5BC6] flex-shrink-0"
                              strokeWidth={2}
                            />
                          ) : (
                            <Square
                              className="w-4 h-4 text-[#6B7280] flex-shrink-0"
                              strokeWidth={2}
                            />
                          )
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-[#1E5BC6] flex-shrink-0" />
                        )}
                        <span
                          className={`text-sm font-medium flex-1 ${
                            isSel ? 'text-[#0D2761]' : 'text-[#374151]'
                          }`}
                        >
                          {h}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-semibold text-[#1E5BC6] bg-[#EEF2FF] px-2 py-0.5 rounded-full">
                            You
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Export progress */}
          {(exporting || done) && progress.length > 0 && (
            <div className="px-6 py-5 space-y-2">
              <p className="text-xs font-semibold text-[#0D2761] uppercase tracking-wider mb-3">
                {done ? 'Export complete' : 'Exporting…'}
              </p>
              {progress.map((p) => (
                <div
                  key={p.handler}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                    p.status === 'done'
                      ? 'bg-green-50 border-green-200'
                      : p.status === 'error'
                      ? 'bg-red-50 border-red-200'
                      : p.status === 'downloading'
                      ? 'bg-[#EEF2FF] border-[#1E5BC6]'
                      : 'bg-[#F8FAFF] border-[#E8EEF8]'
                  }`}
                >
                  {p.status === 'downloading' && (
                    <Loader2 className="w-4 h-4 text-[#1E5BC6] animate-spin flex-shrink-0" strokeWidth={2} />
                  )}
                  {p.status === 'done' && (
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" strokeWidth={2} />
                  )}
                  {p.status === 'error' && (
                    <X className="w-4 h-4 text-red-500 flex-shrink-0" strokeWidth={2} />
                  )}
                  {p.status === 'pending' && (
                    <div className="w-4 h-4 rounded-full border-2 border-[#E8EEF8] flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        p.status === 'done'
                          ? 'text-green-700'
                          : p.status === 'error'
                          ? 'text-red-600'
                          : p.status === 'downloading'
                          ? 'text-[#0D2761]'
                          : 'text-[#6B7280]'
                      }`}
                    >
                      {p.handler}
                    </p>
                    {p.status === 'downloading' && (
                      <p className="text-[10px] text-[#1E5BC6]">Generating report…</p>
                    )}
                    {p.status === 'done' && (
                      <p className="text-[10px] text-green-600">Downloaded successfully</p>
                    )}
                    {p.status === 'error' && (
                      <p className="text-[10px] text-red-500">{p.error ?? 'Export failed'}</p>
                    )}
                    {p.status === 'pending' && (
                      <p className="text-[10px] text-[#6B7280]">Waiting…</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#E8EEF8] bg-[#F8FAFF] flex-shrink-0">
          {done ? (
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex-1 bg-[#0D2761] text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-[#1E5BC6] transition-colors"
              >
                Done
              </button>
              <button
                onClick={() => {
                  setDone(false);
                  setProgress([]);
                  setExporting(false);
                }}
                className="px-4 py-2.5 border border-[#E8EEF8] rounded-xl text-sm text-[#6B7280] hover:text-[#0D2761] hover:border-[#0D2761] transition-colors font-medium"
              >
                Export again
              </button>
            </div>
          ) : exporting ? (
            <div className="flex items-center justify-center gap-2 text-[#6B7280] text-sm py-1">
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
              Exporting reports…
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2.5 border border-[#E8EEF8] rounded-xl text-sm text-[#6B7280] hover:text-[#0D2761] hover:border-[#0D2761] transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={selected.size === 0 || fetching}
                className={`flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl transition-all ${
                  selected.size === 0 || fetching
                    ? 'bg-[#E8EEF8] text-[#6B7280] cursor-not-allowed'
                    : 'bg-[#0D2761] text-white hover:bg-[#1E5BC6] shadow-sm'
                }`}
              >
                <Download className="w-4 h-4" strokeWidth={2} />
                Export{' '}
                {selected.size > 0
                  ? reportType === 'group'
                    ? `Group Report (${selected.size} handler${selected.size !== 1 ? 's' : ''})`
                    : `${selected.size} Report${selected.size !== 1 ? 's' : ''}`
                  : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
