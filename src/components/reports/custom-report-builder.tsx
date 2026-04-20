'use client';

import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

type Dataset = 'claims' | 'payments' | 'flags';
type Format = 'pdf' | 'xlsx' | 'csv';
type Operator = '=' | '!=' | '>' | '<' | 'contains';

interface Filter {
  field: string;
  operator: Operator;
  value: string;
}

const DATASET_COLUMNS: Record<Dataset, { key: string; label: string }[]> = {
  claims: [
    { key: 'claimId', label: 'Claim ID' },
    { key: 'handler', label: 'Handler' },
    { key: 'insured', label: 'Insured' },
    { key: 'broker', label: 'Broker' },
    { key: 'claimStatus', label: 'Claim Status' },
    { key: 'totalIncurred', label: 'Total Incurred' },
    { key: 'totalOs', label: 'Total O/S' },
    { key: 'cause', label: 'Cause' },
    { key: 'daysInCurrentStatus', label: 'Days in Status' },
  ],
  payments: [
    { key: 'claimId', label: 'Claim ID' },
    { key: 'payee', label: 'Payee' },
    { key: 'grossPaidInclVat', label: 'Amount (incl. VAT)' },
    { key: 'requestedBy', label: 'Requested By' },
    { key: 'printedDate', label: 'Payment Date' },
  ],
  flags: [
    { key: 'claimId', label: 'Claim ID' },
    { key: 'flagType', label: 'Flag Type' },
    { key: 'severity', label: 'Severity' },
  ],
};

const DATE_RANGES = [
  { value: 'this-week', label: 'This Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'last-90-days', label: 'Last 90 Days' },
];

const OPERATORS: { value: Operator; label: string }[] = [
  { value: '=', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: '>', label: 'greater than' },
  { value: '<', label: 'less than' },
  { value: 'contains', label: 'contains' },
];

interface Props {
  onClose: () => void;
}

export function CustomReportBuilder({ onClose }: Props) {
  const { showToast } = useToast();
  const [dataset, setDataset] = useState<Dataset>('claims');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(['claimId', 'handler', 'claimStatus']);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [dateRange, setDateRange] = useState('this-month');
  const [format, setFormat] = useState<Format>('xlsx');
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<{ rows: Record<string, unknown>[]; columns: string[] } | null>(null);

  function toggleColumn(key: string) {
    setSelectedColumns(prev =>
      prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key],
    );
  }

  function onDatasetChange(d: Dataset) {
    setDataset(d);
    setSelectedColumns(DATASET_COLUMNS[d].slice(0, 3).map(c => c.key));
    setFilters([]);
    setPreviewData(null);
  }

  function addFilter() {
    const cols = DATASET_COLUMNS[dataset];
    setFilters(prev => [...prev, { field: cols[0]?.key ?? '', operator: '=', value: '' }]);
  }

  function removeFilter(idx: number) {
    setFilters(prev => prev.filter((_, i) => i !== idx));
  }

  function updateFilter(idx: number, key: keyof Filter, value: string) {
    setFilters(prev => prev.map((f, i) => i === idx ? { ...f, [key]: value } : f));
  }

  async function handlePreview() {
    setPreviewing(true);
    try {
      const res = await fetch('/api/reports/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset, columns: selectedColumns, filters, dateRange, format, preview: true }),
      });
      if (!res.ok) throw new Error('Preview failed');
      const data = await res.json();
      setPreviewData(data);
    } catch {
      showToast('Preview failed', 'error');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch('/api/reports/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset, columns: selectedColumns, filters, dateRange, format }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'csv' ? 'csv' : format === 'pdf' ? 'pdf' : 'xlsx';
      a.download = `custom-report-${dataset}-${new Date().toISOString().split('T')[0]}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Report downloaded', 'success');
    } catch {
      showToast('Failed to generate report', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EEF8]">
          <h2 className="text-lg font-semibold text-[#0D2761]">Custom Report Builder</h2>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#0D2761]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Dataset */}
          <div>
            <p className="text-sm font-semibold text-[#0D2761] mb-2">Dataset</p>
            <div className="flex gap-3">
              {(['claims', 'payments', 'flags'] as Dataset[]).map(d => (
                <label key={d} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={dataset === d}
                    onChange={() => onDatasetChange(d)}
                    className="accent-[#1E5BC6]"
                  />
                  <span className="text-sm capitalize text-[#0D2761]">{d}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Columns */}
          <div>
            <p className="text-sm font-semibold text-[#0D2761] mb-2">Columns</p>
            <div className="flex flex-wrap gap-2">
              {DATASET_COLUMNS[dataset].map(col => (
                <label key={col.key} className="flex items-center gap-1.5 cursor-pointer bg-[#F4F6FA] rounded-lg px-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(col.key)}
                    onChange={() => toggleColumn(col.key)}
                    className="accent-[#1E5BC6]"
                  />
                  <span className="text-sm text-[#0D2761]">{col.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-[#0D2761]">Filters</p>
              <button
                onClick={addFilter}
                className="flex items-center gap-1.5 text-xs text-[#1E5BC6] hover:text-[#0D2761]"
              >
                <Plus className="w-3.5 h-3.5" />
                Add filter
              </button>
            </div>
            <div className="space-y-2">
              {filters.length === 0 && (
                <p className="text-xs text-[#6B7280]">No filters applied — all records will be included.</p>
              )}
              {filters.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2 flex-wrap">
                  <select
                    value={f.field}
                    onChange={e => updateFilter(idx, 'field', e.target.value)}
                    className="text-sm border border-[#E8EEF8] rounded-md px-2 py-1.5 bg-white text-[#0D2761]"
                  >
                    {DATASET_COLUMNS[dataset].map(col => (
                      <option key={col.key} value={col.key}>{col.label}</option>
                    ))}
                  </select>
                  <select
                    value={f.operator}
                    onChange={e => updateFilter(idx, 'operator', e.target.value)}
                    className="text-sm border border-[#E8EEF8] rounded-md px-2 py-1.5 bg-white text-[#0D2761]"
                  >
                    {OPERATORS.map(op => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={f.value}
                    onChange={e => updateFilter(idx, 'value', e.target.value)}
                    placeholder="value"
                    className="text-sm border border-[#E8EEF8] rounded-md px-2 py-1.5 bg-white text-[#0D2761] w-36 focus:outline-none focus:border-[#1E5BC6]"
                  />
                  <button onClick={() => removeFilter(idx)} className="text-[#6B7280] hover:text-[#991B1B]">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div>
            <p className="text-sm font-semibold text-[#0D2761] mb-2">Date Range</p>
            <select
              value={dateRange}
              onChange={e => setDateRange(e.target.value)}
              className="text-sm border border-[#E8EEF8] rounded-md px-2 py-1.5 bg-white text-[#0D2761]"
            >
              {DATE_RANGES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Format */}
          <div>
            <p className="text-sm font-semibold text-[#0D2761] mb-2">Format</p>
            <div className="flex gap-3">
              {(['pdf', 'xlsx', 'csv'] as Format[]).map(f => (
                <label key={f} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={format === f}
                    onChange={() => setFormat(f)}
                    className="accent-[#1E5BC6]"
                    disabled={f === 'pdf' && dataset !== 'claims'}
                  />
                  <span className={`text-sm uppercase text-[#0D2761] ${f === 'pdf' && dataset !== 'claims' ? 'opacity-40' : ''}`}>{f}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Preview */}
          {previewData && (
            <div>
              <p className="text-sm font-semibold text-[#0D2761] mb-2">Preview (first 50 rows)</p>
              <div className="overflow-x-auto border border-[#E8EEF8] rounded-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                      {previewData.columns.map(c => (
                        <th key={c} className="px-3 py-2 text-left text-[#F5A800] uppercase tracking-wide whitespace-nowrap font-semibold">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/40' : ''}`}>
                        {previewData.columns.map(c => (
                          <td key={c} className="px-3 py-2 text-[#0D2761] whitespace-nowrap">
                            {String(row[c] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#E8EEF8] flex items-center justify-between gap-3">
          <button
            onClick={handlePreview}
            disabled={previewing || selectedColumns.length === 0}
            className="px-4 py-2 text-sm font-medium text-[#1E5BC6] border border-[#1E5BC6] rounded-lg hover:bg-[#F4F6FA] disabled:opacity-50"
          >
            {previewing ? 'Previewing...' : 'Preview'}
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#6B7280] hover:text-[#0D2761]">
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={loading || selectedColumns.length === 0}
              className="px-5 py-2 text-sm font-semibold bg-[#1E5BC6] text-white rounded-lg hover:bg-[#0D2761] disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
