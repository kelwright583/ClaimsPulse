'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import type { DrillDownType, DrillDownFilters } from './types';

interface Props {
  type: DrillDownType;
  filters: DrillDownFilters;
  filteredCount: number;
  totalCount: number;
}

export function ExportButton({ type, filters, filteredCount, totalCount }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function doExport(format: 'csv' | 'xlsx', scope: 'filtered' | 'full') {
    const key = `${format}-${scope}`;
    setLoading(key);
    setOpen(false);
    try {
      const params = new URLSearchParams({ type, format, scope });
      if (scope === 'filtered') {
        if (filters.handler) params.set('handler', filters.handler);
        if (filters.status) params.set('status', filters.status);
        if (filters.cause) params.set('cause', filters.cause);
        if (filters.area) params.set('area', filters.area);
        if (filters.from) params.set('from', filters.from);
        if (filters.to) params.set('to', filters.to);
      }
      const res = await fetch(`/api/dashboard/drill-down/export?${params.toString()}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `${type}-${scope}-${today}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silent fail
    } finally {
      setLoading(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8EEF8] bg-white text-xs font-medium text-[#0D2761] hover:bg-[#F4F6FA] transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Export
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-[#E8EEF8] rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 bg-[#F4F6FA] border-b border-[#E8EEF8]">
            <p className="text-xs font-semibold text-[#0D2761]">
              Export filtered view ({filteredCount.toLocaleString('en-ZA')})
            </p>
          </div>
          <button
            onClick={() => doExport('csv', 'filtered')}
            disabled={loading !== null}
            className="w-full text-left px-4 py-2 text-xs text-[#374151] hover:bg-[#F4F6FA] flex items-center gap-2 disabled:opacity-50"
          >
            📄 as CSV {loading === 'csv-filtered' && '…'}
          </button>
          <button
            onClick={() => doExport('xlsx', 'filtered')}
            disabled={loading !== null}
            className="w-full text-left px-4 py-2 text-xs text-[#374151] hover:bg-[#F4F6FA] flex items-center gap-2 disabled:opacity-50"
          >
            📊 as Excel {loading === 'xlsx-filtered' && '…'}
          </button>

          <div className="border-t border-[#E8EEF8]">
            <div className="px-3 py-2 bg-[#F4F6FA] border-b border-[#E8EEF8]">
              <p className="text-xs font-semibold text-[#0D2761]">
                Export full dataset ({totalCount.toLocaleString('en-ZA')})
              </p>
            </div>
            <button
              onClick={() => doExport('csv', 'full')}
              disabled={loading !== null}
              className="w-full text-left px-4 py-2 text-xs text-[#374151] hover:bg-[#F4F6FA] flex items-center gap-2 disabled:opacity-50"
            >
              📄 as CSV {loading === 'csv-full' && '…'}
            </button>
            <button
              onClick={() => doExport('xlsx', 'full')}
              disabled={loading !== null}
              className="w-full text-left px-4 py-2 text-xs text-[#374151] hover:bg-[#F4F6FA] flex items-center gap-2 disabled:opacity-50"
            >
              📊 as Excel {loading === 'xlsx-full' && '…'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
