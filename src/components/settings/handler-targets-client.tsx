'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/toast';
import type { UserRole } from '@/types/roles';

interface Handler {
  handler: string;
  openClaims: number;
}

interface HandlerTarget {
  id: string;
  handler: string;
  metricType: string;
  targetValue: number;
  cadence: string;
  unit: string;
  label: string;
  updatedAt: string;
}

interface MetricConfig {
  id: string;
  metricType: string;
  label: string;
  unit: string;
  cadence: string;
  description: string | null;
  isActive: boolean;
}

interface Props {
  role: UserRole;
  userId: string;
}

export function HandlerTargetsClient({ role }: Props) {
  const { showToast } = useToast();
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [targets, setTargets] = useState<HandlerTarget[]>([]);
  const [metrics, setMetrics] = useState<MetricConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [handlerFilter, setHandlerFilter] = useState<string>('all');
  // Local cell edits: key = `${handler}::${metricType}`
  const [cellEdits, setCellEdits] = useState<Record<string, string>>({});
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const canEdit = role === 'HEAD_OF_CLAIMS' || role === 'TEAM_LEADER';

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hRes, tRes, mRes] = await Promise.all([
        fetch('/api/handlers'),
        fetch('/api/handler-targets'),
        fetch('/api/target-metrics'),
      ]);
      if (!hRes.ok || !tRes.ok || !mRes.ok) throw new Error('Failed to load data');
      const [h, t, m] = await Promise.all([hRes.json(), tRes.json(), mRes.json()]);
      setHandlers(h);
      setTargets(t);
      setMetrics(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  function getTarget(handler: string, metricType: string): number | null {
    const t = targets.find(t => t.handler === handler && t.metricType === metricType);
    return t ? t.targetValue : null;
  }

  function getCellKey(handler: string, metricType: string) {
    return `${handler}::${metricType}`;
  }

  function getCellValue(handler: string, metricType: string): string {
    const key = getCellKey(handler, metricType);
    if (key in cellEdits) return cellEdits[key];
    const val = getTarget(handler, metricType);
    return val !== null ? String(val) : '';
  }

  function onCellChange(handler: string, metricType: string, value: string) {
    const key = getCellKey(handler, metricType);
    setCellEdits(prev => ({ ...prev, [key]: value }));
  }

  async function onCellBlur(handler: string, metricType: string) {
    const key = getCellKey(handler, metricType);
    const rawVal = cellEdits[key];
    if (rawVal === undefined) return;

    const trimmed = rawVal.trim();

    if (trimmed === '') {
      // Delete if was set
      const existing = getTarget(handler, metricType);
      if (existing !== null) {
        setSavingCell(key);
        try {
          const res = await fetch('/api/handler-targets', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handler, metricType }),
          });
          if (!res.ok) throw new Error('Delete failed');
          showToast('Target removed', 'success');
          setTargets(prev => prev.filter(t => !(t.handler === handler && t.metricType === metricType)));
        } catch {
          showToast('Failed to remove target', 'error');
        } finally {
          setSavingCell(null);
          setCellEdits(prev => { const next = { ...prev }; delete next[key]; return next; });
        }
      } else {
        setCellEdits(prev => { const next = { ...prev }; delete next[key]; return next; });
      }
      return;
    }

    const num = parseFloat(trimmed);
    if (isNaN(num)) {
      showToast('Please enter a valid number', 'error');
      return;
    }

    setSavingCell(key);
    try {
      const res = await fetch('/api/handler-targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handler, metricType, targetValue: num }),
      });
      if (!res.ok) throw new Error('Save failed');
      const saved = await res.json();
      showToast('Target saved', 'success');
      setTargets(prev => {
        const exists = prev.find(t => t.handler === handler && t.metricType === metricType);
        const cfg = metrics.find(m => m.metricType === metricType);
        const next: HandlerTarget = {
          id: saved.id,
          handler,
          metricType,
          targetValue: num,
          cadence: cfg?.cadence ?? '',
          unit: cfg?.unit ?? '',
          label: cfg?.label ?? metricType,
          updatedAt: saved.updatedAt,
        };
        if (exists) return prev.map(t => (t.handler === handler && t.metricType === metricType ? next : t));
        return [...prev, next];
      });
    } catch {
      showToast('Failed to save target', 'error');
    } finally {
      setSavingCell(null);
      setCellEdits(prev => { const next = { ...prev }; delete next[key]; return next; });
    }
  }

  async function onCadenceChange(metricType: string, cadence: string) {
    try {
      const res = await fetch('/api/target-metrics', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metricType, cadence }),
      });
      if (!res.ok) throw new Error('Update failed');
      setMetrics(prev => prev.map(m => m.metricType === metricType ? { ...m, cadence } : m));
      showToast('Cadence updated', 'success');
    } catch {
      showToast('Failed to update cadence', 'error');
    }
  }

  const filteredHandlers = handlerFilter === 'all'
    ? handlers
    : handlers.filter(h => h.handler === handlerFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#6B7280]">Loading handler targets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={loadAll} className="mt-3 text-sm text-[#1E5BC6] underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-[#0D2761]">Handler Targets</h1>
        <p className="text-sm text-[#6B7280] mt-1">Configure per-handler performance targets and metric cadences.</p>
      </div>

      {/* Metric cadences */}
      <section>
        <h2 className="text-base font-semibold text-[#0D2761] mb-3">Metric Cadences</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {metrics.map(m => (
            <div key={m.metricType} className="bg-white rounded-xl border border-[#E8EEF8] shadow-[0_1px_3px_rgba(13,39,97,0.06)] p-4">
              <p className="text-sm font-semibold text-[#0D2761]">{m.label}</p>
              {m.description && (
                <p className="text-xs text-[#6B7280] mt-0.5 mb-3">{m.description}</p>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#6B7280]">Cadence:</span>
                <select
                  value={m.cadence}
                  onChange={e => onCadenceChange(m.metricType, e.target.value)}
                  disabled={role !== 'HEAD_OF_CLAIMS'}
                  className="text-xs border border-[#E8EEF8] rounded-md px-2 py-1 text-[#0D2761] bg-white disabled:opacity-50"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Handler targets matrix */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-[#0D2761]">Handler Targets Matrix</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#6B7280]">Handler:</label>
            <select
              value={handlerFilter}
              onChange={e => setHandlerFilter(e.target.value)}
              className="text-sm border border-[#E8EEF8] rounded-md px-2 py-1.5 text-[#0D2761] bg-white"
            >
              <option value="all">All handlers</option>
              {handlers.map(h => (
                <option key={h.handler} value={h.handler}>{h.handler}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredHandlers.length === 0 ? (
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
            <p className="text-sm text-[#6B7280]">No handlers found in latest snapshot.</p>
          </div>
        ) : (
          <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(13,39,97,0.06)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap sticky left-0 bg-[#F4F6FA]">
                      Handler
                    </th>
                    {metrics.map(m => (
                      <th key={m.metricType} className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                        <span title={m.description ?? m.label}>{m.label}</span>
                        <span className="ml-1 text-[#6B7280] normal-case font-normal">({m.unit})</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredHandlers.map((h, idx) => (
                    <tr
                      key={h.handler}
                      className={`border-b border-[#E8EEF8] last:border-0 ${idx % 2 === 1 ? 'bg-[#F4F6FA]/40' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-[#0D2761] whitespace-nowrap sticky left-0 bg-white">
                        <div>{h.handler}</div>
                        <div className="text-xs text-[#6B7280]">{h.openClaims} open</div>
                      </td>
                      {metrics.map(m => {
                        const key = getCellKey(h.handler, m.metricType);
                        const cellVal = getCellValue(h.handler, m.metricType);
                        const isSaving = savingCell === key;
                        return (
                          <td key={m.metricType} className="px-3 py-2">
                            {canEdit ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={cellVal}
                                  placeholder="—"
                                  onChange={e => onCellChange(h.handler, m.metricType, e.target.value)}
                                  onBlur={() => onCellBlur(h.handler, m.metricType)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                  }}
                                  disabled={isSaving}
                                  className="w-20 text-sm border border-[#E8EEF8] rounded px-2 py-1 text-[#0D2761] bg-white focus:outline-none focus:border-[#1E5BC6] disabled:opacity-50"
                                />
                                {m.unit === 'pct' && <span className="text-xs text-[#6B7280]">%</span>}
                                {isSaving && <span className="text-xs text-[#6B7280]">...</span>}
                              </div>
                            ) : (
                              <span className="text-sm text-[#0D2761]">
                                {cellVal !== '' ? `${cellVal}${m.unit === 'pct' ? '%' : ''}` : '—'}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
