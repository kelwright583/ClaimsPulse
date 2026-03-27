'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

interface ReportCard {
  id: string;
  name: string;
  description: string;
  updates: string;
  endpoint: string;
  accepts: string;
  lastImported?: string | null;
}

const REPORT_CARDS: Omit<ReportCard, 'lastImported'>[] = [
  {
    id: 'claims',
    name: 'Claims Outstanding',
    description: 'Daily SpreadsheetML XLS report with all active claims and financial positions.',
    updates: 'Claim snapshots, delta flags, SLA breaches, fraud signals',
    endpoint: '/api/import/claims',
    accepts: '.xls,.xlsx',
  },
  {
    id: 'payee',
    name: 'Payee Data',
    description: 'Payments register with cheque details, payees, and authorisation dates.',
    updates: 'Payment records, integrity flags, self-authorisation checks',
    endpoint: '/api/import/payee',
    accepts: '.xls,.xlsx',
  },
  {
    id: 'revenue',
    name: 'Revenue Analysis',
    description: 'Monthly premium and commission data by broker and class.',
    updates: 'Premium records, loss ratio calculations',
    endpoint: '/api/import/revenue',
    accepts: '.xls,.xlsx',
  },
  {
    id: 'movement',
    name: 'Movement Summary',
    description: 'Monthly financial movement report with UPR, IBNR, and underwriting results.',
    updates: 'Financial summaries, UW result, SASRIA, VAT sections',
    endpoint: '/api/import/movement',
    accepts: '.xls,.xlsx',
  },
];

type Step = 'upload' | 'preview' | 'importing' | 'results';

interface ImportResult {
  success: boolean;
  rowsRead: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsErrored: number;
  error?: string;
  snapshotDate?: string;
}

interface PreviewRow {
  [key: string]: unknown;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function UploadZone() {
  const [activeCard, setActiveCard] = useState<ReportCard | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [history, setHistory] = useState<Record<string, string | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch last import date per report type
  useEffect(() => {
    fetch('/api/import/history')
      .then(r => r.json())
      .then((data: Array<{ reportType: string; createdAt: string }>) => {
        const map: Record<string, string | null> = {};
        for (const run of data) {
          const key = run.reportType.toLowerCase().replace('_outstanding', '').replace('_analysis', '').replace('_summary', '');
          if (!map[key]) map[key] = run.createdAt;
        }
        setHistory(map);
      })
      .catch(() => {});
  }, []);

  const openModal = (card: Omit<ReportCard, 'lastImported'>) => {
    const lastImported = history[card.id] ?? null;
    setActiveCard({ ...card, lastImported });
    setStep('upload');
    setFile(null);
    setPreview([]);
    setPreviewHeaders([]);
    setResult(null);
    setProgress(0);
  };

  const closeModal = () => {
    setActiveCard(null);
    setStep('upload');
    setFile(null);
    setPreview([]);
    setPreviewHeaders([]);
    setResult(null);
    setImporting(false);
    setProgress(0);
  };

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    // Generate preview using dynamic import of SheetJS
    try {
      const XLSX = await import('xlsx');
      const buffer = await f.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];

      // Determine if we need to skip rows (claims report has 2 header rows)
      const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
      // Try to detect if row 3 is the real header by looking at row indices
      // For claims report, offset by 2; for others, use row 0
      const isClaimsLike = activeCard?.id === 'claims';
      if (isClaimsLike) {
        const claimsRange = { ...range, s: { ...range.s, r: 2 } };
        sheet['!ref'] = XLSX.utils.encode_range(claimsRange);
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: null,
        raw: false,
      });

      const first10 = rows.slice(0, 10) as PreviewRow[];
      if (first10.length > 0) {
        setPreviewHeaders(Object.keys(first10[0]).slice(0, 12)); // show first 12 columns
        setPreview(first10);
      }
    } catch {
      setPreview([]);
      setPreviewHeaders([]);
    }
    setStep('preview');
  }, [activeCard]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const runImport = async () => {
    if (!file || !activeCard) return;
    setStep('importing');
    setImporting(true);
    setProgress(10);

    const fd = new FormData();
    fd.append('file', file);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 8, 85));
    }, 500);

    try {
      const res = await fetch(activeCard.endpoint, { method: 'POST', body: fd });
      clearInterval(progressInterval);
      setProgress(100);

      const data = await res.json();
      if (!res.ok) {
        setResult({ success: false, rowsRead: 0, rowsCreated: 0, rowsUpdated: 0, rowsErrored: 0, error: data.error ?? 'Import failed' });
      } else {
        setResult(data);
        // Refresh history
        fetch('/api/import/history')
          .then(r => r.json())
          .then((d: Array<{ reportType: string; createdAt: string }>) => {
            const map: Record<string, string | null> = {};
            for (const run of d) {
              const key = run.reportType.toLowerCase().replace('_outstanding', '').replace('_analysis', '').replace('_summary', '');
              if (!map[key]) map[key] = run.createdAt;
            }
            setHistory(map);
          })
          .catch(() => {});
      }
    } catch (err) {
      clearInterval(progressInterval);
      setResult({ success: false, rowsRead: 0, rowsCreated: 0, rowsUpdated: 0, rowsErrored: 0, error: String(err) });
    }

    setImporting(false);
    setStep('results');
  };

  const historyKey = (id: string) => {
    return history[id] ?? null;
  };

  return (
    <>
      {/* Import type cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {REPORT_CARDS.map(card => (
          <button
            key={card.id}
            onClick={() => openModal(card)}
            className="text-left rounded-lg border border-[#D3D1C7] bg-white p-5 hover:border-[#1B3A5C] hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-md bg-[#1B3A5C]/8 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#1B3A5C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#0F6E56]/10 text-[#0F6E56]">
                Upload
              </span>
            </div>
            <h3 className="font-medium text-[#2C2C2A] text-sm mb-1">{card.name}</h3>
            <p className="text-xs text-[#5F5E5A] mb-3 leading-relaxed">{card.description}</p>
            <div className="border-t border-[#D3D1C7] pt-3">
              <p className="text-[11px] text-[#5F5E5A]">
                Last imported:{' '}
                <span className="text-[#2C2C2A]">
                  {historyKey(card.id) ? formatDate(historyKey(card.id)) : 'Never'}
                </span>
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Modal overlay */}
      {activeCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border border-[#D3D1C7] shadow-lg w-full max-w-2xl mx-4 overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#D3D1C7]">
              <div>
                <h2 className="text-base font-semibold text-[#2C2C2A]">Import: {activeCard.name}</h2>
                <p className="text-xs text-[#5F5E5A] mt-0.5">{activeCard.updates}</p>
              </div>
              <button
                onClick={closeModal}
                className="text-[#5F5E5A] hover:text-[#2C2C2A] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-0 px-6 pt-4 pb-2">
              {(['upload', 'preview', 'importing', 'results'] as Step[]).map((s, idx) => {
                const labels = ['Upload', 'Preview', 'Importing', 'Results'];
                const steps: Step[] = ['upload', 'preview', 'importing', 'results'];
                const currentIdx = steps.indexOf(step);
                const isActive = s === step;
                const isDone = steps.indexOf(s) < currentIdx;
                return (
                  <React.Fragment key={s}>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                        isDone ? 'bg-[#0F6E56] text-white' :
                        isActive ? 'bg-[#1B3A5C] text-white' :
                        'bg-[#D3D1C7] text-[#5F5E5A]'
                      }`}>
                        {isDone ? '✓' : idx + 1}
                      </div>
                      <span className={`text-xs font-medium ${isActive ? 'text-[#1B3A5C]' : 'text-[#5F5E5A]'}`}>
                        {labels[idx]}
                      </span>
                    </div>
                    {idx < 3 && <div className="flex-1 h-px bg-[#D3D1C7] mx-2 min-w-[20px]" />}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Modal body */}
            <div className="px-6 py-4 min-h-[240px]">
              {/* STEP: Upload */}
              {step === 'upload' && (
                <div
                  className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
                    dragOver ? 'border-[#1B3A5C] bg-[#1B3A5C]/5' : 'border-[#D3D1C7] hover:border-[#1B3A5C]/50'
                  }`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <svg className="w-10 h-10 text-[#D3D1C7] mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                  <p className="text-sm font-medium text-[#2C2C2A] mb-1">Drag and drop your file here</p>
                  <p className="text-xs text-[#5F5E5A] mb-4">Accepts {activeCard.accepts} files</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-[#1B3A5C] text-white text-sm font-medium rounded-md hover:bg-[#1B3A5C]/90 transition-colors"
                  >
                    Browse files
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={activeCard.accepts}
                    className="hidden"
                    onChange={handleFileInput}
                  />
                </div>
              )}

              {/* STEP: Preview */}
              {step === 'preview' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium text-[#2C2C2A]">{file?.name}</p>
                      <p className="text-xs text-[#5F5E5A]">Preview — first {preview.length} rows</p>
                    </div>
                    <button
                      onClick={() => { setStep('upload'); setFile(null); setPreview([]); }}
                      className="text-xs text-[#5F5E5A] hover:text-[#2C2C2A]"
                    >
                      Change file
                    </button>
                  </div>
                  {preview.length > 0 ? (
                    <div className="overflow-x-auto border border-[#D3D1C7] rounded-lg">
                      <table className="text-[11px] w-full">
                        <thead>
                          <tr className="bg-[#F7F6F2]">
                            {previewHeaders.map(h => (
                              <th key={h} className="px-2 py-1.5 text-left font-medium text-[#5F5E5A] whitespace-nowrap border-b border-[#D3D1C7]">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((row, i) => (
                            <tr key={i} className="border-b border-[#D3D1C7] last:border-0">
                              {previewHeaders.map(h => (
                                <td key={h} className="px-2 py-1.5 text-[#2C2C2A] whitespace-nowrap max-w-[120px] truncate">
                                  {row[h] != null ? String(row[h]) : '—'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-[#5F5E5A]">Could not generate preview. The file will still be imported.</p>
                  )}
                </div>
              )}

              {/* STEP: Importing */}
              {step === 'importing' && (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-full max-w-xs mb-4">
                    <div className="flex justify-between text-xs text-[#5F5E5A] mb-1">
                      <span>Importing...</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-[#D3D1C7] rounded-full h-2">
                      <div
                        className="bg-[#1B3A5C] h-2 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-sm text-[#5F5E5A]">Processing {file?.name}</p>
                </div>
              )}

              {/* STEP: Results */}
              {step === 'results' && result && (
                <div>
                  {result.success ? (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-full bg-[#0F6E56]/10 flex items-center justify-center">
                          <svg className="w-4 h-4 text-[#0F6E56]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-[#2C2C2A]">Import completed successfully</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Rows read', value: result.rowsRead },
                          { label: 'Created', value: result.rowsCreated },
                          { label: 'Updated', value: result.rowsUpdated },
                          { label: 'Errors', value: result.rowsErrored },
                        ].map(stat => (
                          <div key={stat.label} className="rounded-lg border border-[#D3D1C7] p-3 text-center">
                            <p className="text-xl font-semibold text-[#1B3A5C]">{stat.value}</p>
                            <p className="text-xs text-[#5F5E5A] mt-0.5">{stat.label}</p>
                          </div>
                        ))}
                      </div>
                      {result.snapshotDate && (
                        <p className="text-xs text-[#5F5E5A] mt-3">
                          Snapshot date: {new Date(result.snapshotDate).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#A32D2D]/10 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-[#A32D2D]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#A32D2D]">Import failed</p>
                        <p className="text-xs text-[#5F5E5A] mt-1">{result.error}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#D3D1C7] bg-[#F7F6F2]">
              {step === 'upload' && (
                <button onClick={closeModal} className="px-4 py-2 text-sm text-[#5F5E5A] hover:text-[#2C2C2A]">
                  Cancel
                </button>
              )}
              {step === 'preview' && (
                <>
                  <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm text-[#5F5E5A] hover:text-[#2C2C2A]">
                    Back
                  </button>
                  <button
                    onClick={runImport}
                    className="px-5 py-2 bg-[#1B3A5C] text-white text-sm font-medium rounded-md hover:bg-[#1B3A5C]/90 transition-colors"
                  >
                    Import now
                  </button>
                </>
              )}
              {step === 'importing' && (
                <button disabled className="px-5 py-2 bg-[#D3D1C7] text-[#5F5E5A] text-sm font-medium rounded-md cursor-not-allowed">
                  Importing...
                </button>
              )}
              {step === 'results' && (
                <>
                  <button
                    onClick={() => openModal(activeCard)}
                    className="px-4 py-2 text-sm text-[#5F5E5A] hover:text-[#2C2C2A]"
                  >
                    Import another
                  </button>
                  <button
                    onClick={closeModal}
                    className="px-5 py-2 bg-[#1B3A5C] text-white text-sm font-medium rounded-md hover:bg-[#1B3A5C]/90 transition-colors"
                  >
                    Done
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
