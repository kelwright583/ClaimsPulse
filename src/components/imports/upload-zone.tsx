'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  FileSpreadsheet, CreditCard, TrendingUp, BarChart2,
  Download, Upload, CheckCircle2, X,
} from 'lucide-react';
import { IMPORT_TYPES, type ImportTypeConfig } from '@/app/(settings)/imports/constants';

type Step = 'upload' | 'preview' | 'validate' | 'importing' | 'results';

const STEPS: Step[] = ['upload', 'preview', 'validate', 'importing', 'results'];
const STEP_LABELS = ['Upload', 'Preview', 'Validate', 'Import', 'Results'];

interface ImportResult {
  success: boolean;
  rowsRead: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsSkipped?: number;
  rowsErrored: number;
  error?: string;
  snapshotDate?: string;
}

interface PreviewRow {
  [key: string]: unknown;
}

const FREQUENCY_STYLES: Record<string, { bg: string; text: string }> = {
  Daily:      { bg: '#FEF3C7', text: '#92400E' },
  Weekly:     { bg: '#EFF6FF', text: '#1E40AF' },
  Monthly:    { bg: '#F4F6FA', text: '#6B7280' },
  'On demand':{ bg: '#F4F6FA', text: '#6B7280' },
};

const REPORT_ICONS: Record<string, LucideIcon> = {
  claims:   FileSpreadsheet,
  payee:    CreditCard,
  revenue:  TrendingUp,
  movement: BarChart2,
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function UploadZone() {
  const [activeConfig, setActiveConfig] = useState<ImportTypeConfig | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRowCount, setPreviewRowCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [history, setHistory] = useState<Record<string, string | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/import/history')
      .then(r => r.json())
      .then((data: Array<{ reportType: string; createdAt: string }>) => {
        const map: Record<string, string | null> = {};
        for (const run of data) {
          const key = run.reportType
            .toLowerCase()
            .replace('_outstanding', '')
            .replace('_analysis', '')
            .replace('_summary', '');
          if (!map[key]) map[key] = run.createdAt;
        }
        setHistory(map);
      })
      .catch(() => {});
  }, []);

  const refreshHistory = () => {
    fetch('/api/import/history')
      .then(r => r.json())
      .then((data: Array<{ reportType: string; createdAt: string }>) => {
        const map: Record<string, string | null> = {};
        for (const run of data) {
          const key = run.reportType
            .toLowerCase()
            .replace('_outstanding', '')
            .replace('_analysis', '')
            .replace('_summary', '');
          if (!map[key]) map[key] = run.createdAt;
        }
        setHistory(map);
      })
      .catch(() => {});
  };

  const openModal = (config: ImportTypeConfig) => {
    setActiveConfig(config);
    setStep('upload');
    setFile(null);
    setPreview([]);
    setPreviewHeaders([]);
    setPreviewRowCount(0);
    setMissingColumns([]);
    setResult(null);
    setProgress(0);
    setShowColumns(false);
    setImporting(false);
  };

  const closeModal = () => {
    setActiveConfig(null);
    setStep('upload');
    setFile(null);
    setPreview([]);
    setPreviewHeaders([]);
    setPreviewRowCount(0);
    setMissingColumns([]);
    setResult(null);
    setImporting(false);
    setProgress(0);
    setShowColumns(false);
  };

  const handleFile = useCallback(
    async (f: File) => {
      if (!activeConfig) return;
      setFile(f);

      if (activeConfig.key === 'movement') {
        // Movement has non-standard structure — skip preview
        setPreview([]);
        setPreviewHeaders([]);
        setPreviewRowCount(0);
        setStep('preview');
        return;
      }

      try {
        const XLSX = await import('xlsx');
        const buffer = await f.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];

        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: null,
          raw: false,
          range: 0,
        });

        setPreviewRowCount(rows.length);
        const first20 = rows.slice(0, 20) as PreviewRow[];
        if (first20.length > 0) {
          setPreviewHeaders(Object.keys(first20[0]));
          setPreview(first20);
        }
      } catch {
        setPreview([]);
        setPreviewHeaders([]);
      }

      setStep('preview');
    },
    [activeConfig]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const runValidate = () => {
    if (!activeConfig) return;
    const missing = activeConfig.requiredColumns.filter(
      col => !previewHeaders.includes(col)
    );
    setMissingColumns(missing);
    setStep('validate');
  };

  const runImport = async () => {
    if (!file || !activeConfig) return;
    setStep('importing');
    setImporting(true);
    setProgress(10);

    const fd = new FormData();
    fd.append('file', file);

    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 7, 88));
    }, 600);

    try {
      const res = await fetch(activeConfig.endpoint, { method: 'POST', body: fd });
      clearInterval(progressInterval);
      setProgress(100);

      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(text);
      } catch {
        // Server returned non-JSON (HTML error page)
        setResult({
          success: false,
          rowsRead: 0,
          rowsCreated: 0,
          rowsUpdated: 0,
          rowsErrored: 0,
          error: `HTTP ${res.status} — server returned a non-JSON response. Check Netlify function logs for the full error.`,
        });
        setImporting(false);
        setStep('results');
        return;
      }

      if (!res.ok) {
        setResult({
          success: false,
          rowsRead: 0,
          rowsCreated: 0,
          rowsUpdated: 0,
          rowsErrored: 0,
          error: (data.detail as string) ?? (data.error as string) ?? `HTTP ${res.status}`,
        });
      } else {
        setResult(data as unknown as ImportResult);
        refreshHistory();
        // Trigger flag computation asynchronously for claims imports (non-blocking)
        if (activeConfig?.key === 'claims' && data.importRunId) {
          fetch('/api/import/claims/flags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ importRunId: data.importRunId }),
          }).catch(() => {});
        }
      }
    } catch (err) {
      clearInterval(progressInterval);
      setResult({
        success: false,
        rowsRead: 0,
        rowsCreated: 0,
        rowsUpdated: 0,
        rowsErrored: 0,
        error: String(err),
      });
    }

    setImporting(false);
    setStep('results');
  };

  const currentStepIdx = STEPS.indexOf(step);

  return (
    <>
      {/* Import type cards — 2×2 grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {IMPORT_TYPES.map(config => (
          <div
            key={config.key}
            className="bg-white border border-[#E8EEF8] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden"
          >
            <div className="p-5">
              <div className="flex items-start gap-4">
                {/* Blue icon circle — spec: #1E5BC6, white icon */}
                {(() => {
                  const Icon = REPORT_ICONS[config.key] ?? FileSpreadsheet;
                  return (
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 icon-circle"
                      style={{ backgroundColor: '#1E5BC6' }}
                    >
                      <Icon className="w-6 h-6 text-white" strokeWidth={2} />
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-semibold text-[#0D2761] leading-tight">{config.title}</h3>
                    {(() => {
                      const fs = FREQUENCY_STYLES[config.frequency] ?? FREQUENCY_STYLES['On demand'];
                      return (
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: fs.bg, color: fs.text }}
                        >
                          {config.frequency}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-xs text-[#6B7280] leading-relaxed">{config.description}</p>
                </div>
              </div>
            </div>

            <div className="border-t border-[#E8EEF8] px-5 py-3 flex items-center justify-between gap-3 bg-[#F4F6FA]/50">
              <div>
                <p className="text-[11px] text-[#6B7280]">
                  Last imported:{' '}
                  <span className={history[config.key] ? 'text-[#0D2761] font-medium' : 'text-[#991B1B]'}>
                    {history[config.key] ? formatDateTime(history[config.key]) : 'Never imported'}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={config.templateHref}
                  download
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0D2761] hover:text-[#1E5BC6] transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={2} />
                  Template
                </a>
                <button
                  onClick={() => openModal(config)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#F5A800', color: '#0D2761' }}
                >
                  Import report →
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {activeConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EEF8] flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-[#0D2761]">{activeConfig.title}</h2>
                <p className="text-xs text-[#6B7280] mt-0.5">{activeConfig.notes}</p>
              </div>
              <button onClick={closeModal} className="text-[#6B7280] hover:text-[#0D2761] transition-colors ml-4 flex-shrink-0">
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center px-6 pt-4 pb-3 border-b border-[#E8EEF8] flex-shrink-0">
              {STEPS.map((s, idx) => {
                const isActive = s === step;
                const isDone = idx < currentStepIdx;
                return (
                  <React.Fragment key={s}>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                          isDone
                            ? 'text-white'
                            : isActive
                            ? 'text-white'
                            : 'bg-[#E8EEF8] text-[#6B7280]'
                        }`}
                        style={isDone ? { backgroundColor: '#0D2761' } : isActive ? { backgroundColor: '#0D2761' } : {}}
                      >
                        {isDone ? (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        ) : (
                          idx + 1
                        )}
                      </div>
                      <span
                        className={`text-xs font-medium hidden sm:block ${
                          isActive ? 'text-[#0D2761]' : isDone ? 'text-[#0D2761]' : 'text-[#6B7280]'
                        }`}
                      >
                        {STEP_LABELS[idx]}
                      </span>
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div
                        className="flex-1 h-px mx-2 min-w-[12px] transition-colors"
                        style={{ backgroundColor: idx < currentStepIdx ? '#0D2761' : '#E8EEF8' }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Modal body — scrollable */}
            <div className="px-6 py-5 overflow-y-auto flex-1 min-h-[220px]">

              {/* STEP: Upload */}
              {step === 'upload' && (
                <div>
                  {/* Drag-drop zone */}
                  <div
                    className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                      dragOver
                        ? 'border-[#F5A800] bg-[#F5A800]/5'
                        : 'border-[#E8EEF8] hover:border-[#0D2761]/40'
                    }`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 icon-circle"
                      style={{ backgroundColor: '#1E5BC6' }}
                    >
                      <Upload className="w-6 h-6 text-white" strokeWidth={2} />
                    </div>
                    <p className="text-sm font-semibold text-[#0D2761] mb-1">
                      Drag and drop your file here
                    </p>
                    <p className="text-xs text-[#6B7280] mb-4">Accepts .xls and .xlsx files</p>
                    <span className="inline-block px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#0D2761' }}>
                      Browse files
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xls,.xlsx"
                      className="hidden"
                      onChange={handleFileInput}
                    />
                  </div>

                  {/* Parser warnings */}
                  {activeConfig.parserWarnings && activeConfig.parserWarnings.length > 0 && (
                    <div className="mt-4 rounded-lg border border-[#1E5BC6]/20 bg-[#1E5BC6]/5 px-4 py-3">
                      <p className="text-xs font-semibold text-[#1E5BC6] mb-1.5">Parser notes</p>
                      <ul className="space-y-1">
                        {activeConfig.parserWarnings.map((w, i) => (
                          <li key={i} className="text-xs text-[#1E5BC6] flex items-start gap-1.5">
                            <span className="mt-0.5 flex-shrink-0">•</span>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Expected columns expandable */}
                  <div className="mt-4">
                    <button
                      onClick={() => setShowColumns(v => !v)}
                      className="flex items-center gap-1.5 text-xs font-medium text-[#6B7280] hover:text-[#0D2761] transition-colors"
                    >
                      <svg
                        className={`w-3.5 h-3.5 transition-transform ${showColumns ? 'rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                      {showColumns ? 'Hide' : 'Show'} expected columns ({activeConfig.allColumns.length} total)
                    </button>
                    {showColumns && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {activeConfig.allColumns.map(col => {
                          const isRequired = activeConfig.requiredColumns.includes(col);
                          return (
                            <span
                              key={col}
                              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-mono ${
                                isRequired
                                  ? 'bg-[#F5A800]/15 text-[#92400E]'
                                  : 'bg-[#F4F6FA] text-[#6B7280]'
                              }`}
                            >
                              {isRequired && <span className="text-[#991B1B] font-bold">*</span>}
                              {col}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {showColumns && (
                      <p className="mt-1.5 text-[11px] text-[#6B7280]">
                        <span className="text-[#991B1B] font-bold">*</span> Required — import will warn if missing
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* STEP: Preview */}
              {step === 'preview' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-[#0D2761]">{file?.name}</p>
                      <p className="text-xs text-[#6B7280]">
                        {activeConfig.key === 'movement'
                          ? 'Preview not available for this report type'
                          : `${previewRowCount.toLocaleString()} rows · ${previewHeaders.length} columns · showing first ${Math.min(preview.length, 20)}`}
                      </p>
                    </div>
                    <button
                      onClick={() => { setStep('upload'); setFile(null); setPreview([]); setPreviewHeaders([]); }}
                      className="text-xs text-[#6B7280] hover:text-[#0D2761] transition-colors"
                    >
                      Change file
                    </button>
                  </div>

                  {activeConfig.key === 'movement' ? (
                    <div className="rounded-lg border border-[#E8EEF8] bg-[#F4F6FA] p-6 text-center">
                      <svg className="w-8 h-8 text-[#6B7280] mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125-.504 1.125-1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375Z" />
                      </svg>
                      <p className="text-sm font-medium text-[#0D2761] mb-1">Preview not available</p>
                      <p className="text-xs text-[#6B7280]">
                        The Movement Summary uses a non-standard section-based structure. Continue to import it directly.
                      </p>
                    </div>
                  ) : preview.length > 0 ? (
                    <div className="overflow-x-auto border border-[#E8EEF8] rounded-lg">
                      <table className="text-[11px] w-full">
                        <thead>
                          <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                            {previewHeaders.map(h => (
                              <th
                                key={h}
                                className={`px-2 py-2 text-left font-semibold whitespace-nowrap ${
                                  activeConfig.requiredColumns.includes(h)
                                    ? 'text-[#F5A800]'
                                    : 'text-[#6B7280]'
                                }`}
                              >
                                {activeConfig.requiredColumns.includes(h) && (
                                  <span className="text-[#991B1B] mr-0.5">*</span>
                                )}
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((row, i) => (
                            <tr
                              key={i}
                              className={`border-b border-[#E8EEF8] last:border-0 ${
                                i % 2 === 1 ? 'bg-[#F4F6FA]/40' : ''
                              }`}
                            >
                              {previewHeaders.map(h => (
                                <td
                                  key={h}
                                  className="px-2 py-1.5 text-[#0D2761] whitespace-nowrap max-w-[140px] truncate"
                                >
                                  {row[h] != null ? String(row[h]) : '—'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-[#E8EEF8] bg-[#F4F6FA] p-6 text-center">
                      <p className="text-sm text-[#6B7280]">
                        Could not generate preview. The file will still be imported.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* STEP: Validate */}
              {step === 'validate' && (
                <div>
                  <p className="text-sm font-semibold text-[#0D2761] mb-1">Column validation</p>
                  <p className="text-xs text-[#6B7280] mb-4">
                    Checking for required columns in <span className="font-mono text-[#0D2761]">{file?.name}</span>
                  </p>

                  <div className="space-y-1.5">
                    {activeConfig.requiredColumns.map(col => {
                      const found = previewHeaders.includes(col) || activeConfig.key === 'movement';
                      return (
                        <div
                          key={col}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                            found ? 'bg-[#0D2761]/5' : 'bg-[#991B1B]/5'
                          }`}
                        >
                          {found ? (
                            <svg className="w-4 h-4 text-[#0D2761] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-[#991B1B] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          )}
                          <code
                            className={`text-xs font-mono ${
                              found ? 'text-[#0D2761]' : 'text-[#991B1B]'
                            }`}
                          >
                            {col}
                          </code>
                          <span
                            className={`ml-auto text-xs font-medium ${
                              found ? 'text-[#0D2761]' : 'text-[#991B1B]'
                            }`}
                          >
                            {found ? 'Found' : 'Missing'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {missingColumns.length > 0 && (
                    <div className="mt-4 rounded-lg border border-[#F5A800]/30 bg-[#F5A800]/8 px-4 py-3">
                      <p className="text-xs font-semibold text-[#92400E] mb-1">
                        {missingColumns.length} required column{missingColumns.length !== 1 ? 's' : ''} not found
                      </p>
                      <p className="text-xs text-[#92400E]">
                        You can still proceed — these fields will be empty on import. Check your file matches the expected format.
                      </p>
                    </div>
                  )}

                  {missingColumns.length === 0 && activeConfig.key !== 'movement' && (
                    <div className="mt-4 rounded-lg border border-[#0D2761]/20 bg-[#0D2761]/5 px-4 py-3">
                      <p className="text-xs font-semibold text-[#0D2761]">All required columns found — ready to import.</p>
                    </div>
                  )}
                </div>
              )}

              {/* STEP: Importing */}
              {step === 'importing' && (
                <div className="flex flex-col items-center justify-center py-10">
                  <svg
                    className="w-10 h-10 animate-spin mb-4"
                    style={{ color: '#F5A800' }}
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-sm font-semibold text-[#0D2761] mb-1">Importing and processing…</p>
                  <p className="text-xs text-[#6B7280] mb-4 text-center max-w-xs">
                    This may take up to 60 seconds for large files
                  </p>
                  <div className="w-full max-w-xs">
                    <div className="flex justify-between text-xs text-[#6B7280] mb-1">
                      <span>{file?.name}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-[#E8EEF8] rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%`, backgroundColor: '#F5A800' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP: Results */}
              {step === 'results' && result && (
                <div>
                  {result.success ? (
                    <>
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#1E5BC6' }}>
                          <CheckCircle2 className="w-5 h-5 text-white" strokeWidth={2} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#0D2761]">Import completed successfully</p>
                          <p className="text-xs text-[#6B7280] mt-0.5">{activeConfig?.successMessage}</p>
                        </div>
                      </div>

                      {/* 5-stat grid */}
                      <div className="grid grid-cols-5 gap-2 mb-4">
                        {[
                          { label: 'Rows read', value: result.rowsRead, color: 'text-[#0D2761]' },
                          { label: 'Created', value: result.rowsCreated, color: 'text-[#0D2761]' },
                          { label: 'Updated', value: result.rowsUpdated, color: 'text-[#0D2761]' },
                          { label: 'Skipped', value: result.rowsSkipped ?? 0, color: 'text-[#92400E]' },
                          {
                            label: 'Errors',
                            value: result.rowsErrored,
                            color: result.rowsErrored > 0 ? 'text-[#991B1B]' : 'text-[#6B7280]',
                          },
                        ].map(stat => (
                          <div
                            key={stat.label}
                            className="rounded-lg border border-[#E8EEF8] p-3 text-center"
                          >
                            <p className={`text-xl font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
                            <p className="text-[10px] text-[#6B7280] mt-0.5 leading-tight">{stat.label}</p>
                          </div>
                        ))}
                      </div>

                      {result.snapshotDate && (
                        <p className="text-xs text-[#6B7280]">
                          Snapshot date:{' '}
                          <span className="font-medium text-[#0D2761]">
                            {new Date(result.snapshotDate).toLocaleDateString('en-ZA', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </span>
                        </p>
                      )}

                      {missingColumns.length > 0 && (
                        <div className="mt-3 rounded-lg border border-[#F5A800]/30 bg-[#F5A800]/8 px-3 py-2">
                          <p className="text-xs text-[#92400E]">
                            Note: {missingColumns.length} required column{missingColumns.length !== 1 ? 's were' : ' was'} missing from the file.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#991B1B]/10 flex items-center justify-center flex-shrink-0">
                        <X className="w-5 h-5 text-[#991B1B]" strokeWidth={2} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#991B1B]">Import failed</p>
                        <p className="text-xs text-[#6B7280] mt-1 font-mono break-all">{result.error}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div
              className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E8EEF8] flex-shrink-0"
              style={{ backgroundColor: '#F4F6FA' }}
            >
              {step === 'upload' && (
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-[#6B7280] hover:text-[#0D2761] transition-colors"
                >
                  Cancel
                </button>
              )}

              {step === 'preview' && (
                <>
                  <button
                    onClick={() => { setStep('upload'); setFile(null); setPreview([]); setPreviewHeaders([]); }}
                    className="px-4 py-2 text-sm text-[#6B7280] hover:text-[#0D2761] transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={runValidate}
                    className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                    style={{ backgroundColor: '#0D2761' }}
                  >
                    Validate →
                  </button>
                </>
              )}

              {step === 'validate' && (
                <>
                  <button
                    onClick={() => setStep('preview')}
                    className="px-4 py-2 text-sm text-[#6B7280] hover:text-[#0D2761] transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={runImport}
                    className="px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
                    style={{ backgroundColor: '#F5A800', color: '#0D2761' }}
                  >
                    Import now →
                  </button>
                </>
              )}

              {step === 'importing' && (
                <button
                  disabled
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-[#6B7280] bg-[#E8EEF8] cursor-not-allowed"
                >
                  Importing…
                </button>
              )}

              {step === 'results' && (
                <>
                  {activeConfig && (
                    <button
                      onClick={() => openModal(activeConfig)}
                      className="px-4 py-2 text-sm text-[#6B7280] hover:text-[#0D2761] transition-colors"
                    >
                      Import another
                    </button>
                  )}
                  <button
                    onClick={closeModal}
                    className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                    style={{ backgroundColor: '#0D2761' }}
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
