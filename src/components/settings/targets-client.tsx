'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UserRole } from '@/types/roles';

interface TargetRow {
  id: string | null;
  metricType: 'loss_ratio' | 'net_wp' | 'policy_count';
  productLine: string | null;
  uwYear: number;
  annualTarget: number;
  setBy: string | null;
  updatedAt: string | null;
}

interface Props {
  role: UserRole;
  userId: string;
}

const PRODUCT_LINES = ['Motor Taxi', 'SEB Fintech', 'Business Lite'];

const METRIC_CONFIG: Record<
  'loss_ratio' | 'net_wp' | 'policy_count',
  { label: string; format: (v: number) => string; inputStep: string; inputMin: string }
> = {
  loss_ratio: {
    label: 'Net Loss Ratio (%)',
    format: (v) => `${v}%`,
    inputStep: '0.1',
    inputMin: '0',
  },
  net_wp: {
    label: 'Net Written Premium (ZAR)',
    format: (v) =>
      new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v),
    inputStep: '1000',
    inputMin: '0',
  },
  policy_count: {
    label: 'Policy Count',
    format: (v) => new Intl.NumberFormat('en-ZA').format(v),
    inputStep: '1',
    inputMin: '0',
  },
};

// Current UW year: Oct 2025 starts UW year 2026
function getCurrentUwYear(): number {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function TargetsClient({ role }: Props) {
  const [uwYear, setUwYear] = useState<number>(getCurrentUwYear());
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const canEdit = role === 'HEAD_OF_CLAIMS' || role === 'SENIOR_MANAGEMENT';

  const loadTargets = useCallback(() => {
    setLoading(true);
    fetch('/api/targets')
      .then((r) => r.json())
      .then((data: unknown) => setTargets(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTargets();
  }, [loadTargets]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function rowKey(metricType: string, productLine: string | null): string {
    return `${metricType}::${productLine ?? '__all__'}`;
  }

  function getTarget(
    metricType: 'loss_ratio' | 'net_wp' | 'policy_count',
    productLine: string | null
  ): TargetRow | undefined {
    return targets.find(
      (t) => t.metricType === metricType && t.productLine === productLine && t.uwYear === uwYear
    );
  }

  function startEdit(metricType: 'loss_ratio' | 'net_wp' | 'policy_count', productLine: string | null) {
    if (!canEdit) return;
    const existing = getTarget(metricType, productLine);
    setEditingKey(rowKey(metricType, productLine));
    setEditValue(existing ? String(existing.annualTarget) : '');
  }

  async function commitEdit(metricType: 'loss_ratio' | 'net_wp' | 'policy_count', productLine: string | null) {
    const parsed = parseFloat(editValue);
    if (isNaN(parsed)) {
      setEditingKey(null);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metricType, productLine, uwYear, annualTarget: parsed }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Targets saved');
      await loadTargets();
    } catch {
      showToast('Failed to save target');
    } finally {
      setSaving(false);
      setEditingKey(null);
    }
  }

  const currentYear = getCurrentUwYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  const hasAnyTargetForYear = targets.some((t) => t.uwYear === uwYear);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#6B7280]">Loading targets…</p>
      </div>
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg bg-[#065F46] text-white">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0D2761]">Annual Targets</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Set once per financial year (Oct–Sep). Recalculated monthly.
          </p>
        </div>

        {/* UW Year selector */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <label className="text-sm text-[#6B7280] font-medium">UW Year</label>
          <select
            value={uwYear}
            onChange={(e) => setUwYear(Number(e.target.value))}
            className="px-3 py-1.5 border border-[#E8EEF8] rounded-lg text-sm text-[#0D2761] bg-white focus:outline-none focus:border-[#1E5BC6]"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y} {y === currentYear ? '(current)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Info banner if no targets set */}
      {!hasAnyTargetForYear && (
        <div className="mb-6 flex items-start gap-3 bg-[#1E5BC6]/5 border border-[#1E5BC6]/20 rounded-xl px-4 py-3">
          <div className="mt-0.5 w-4 h-4 flex-shrink-0 rounded-full bg-[#1E5BC6] flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">i</span>
          </div>
          <p className="text-sm text-[#0D2761]">
            No targets set for this financial year. Enter your annual targets below to activate the Executive dashboard.
          </p>
        </div>
      )}

      {/* Metric sections */}
      {(Object.keys(METRIC_CONFIG) as Array<'loss_ratio' | 'net_wp' | 'policy_count'>).map((metricType) => {
        const config = METRIC_CONFIG[metricType];
        const productLineRows: Array<string | null> = [null, ...PRODUCT_LINES];

        return (
          <div
            key={metricType}
            className="mb-6 bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
          >
            <div className="px-5 py-3 border-b border-[#E8EEF8] bg-[#F4F6FA]">
              <h2 className="text-sm font-semibold text-[#0D2761]">{config.label}</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8EEF8]">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">
                      Product Line
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide w-48">
                      Annual Target
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide w-36">
                      Last Updated
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide w-48">
                      Updated By
                    </th>
                    {canEdit && (
                      <th className="px-4 py-2.5 w-20 text-xs font-semibold text-[#F5A800] uppercase tracking-wide">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {productLineRows.map((pl) => {
                    const key = rowKey(metricType, pl);
                    const existing = getTarget(metricType, pl);
                    const isEditing = editingKey === key;

                    return (
                      <tr
                        key={key}
                        className="border-b border-[#E8EEF8] last:border-0 hover:bg-[#F4F6FA] transition-colors"
                      >
                        {/* Product line */}
                        <td className="px-4 py-3 text-[#0D2761] font-medium">
                          {pl === null ? (
                            <span className="flex items-center gap-1.5">
                              All products
                              <span className="text-[10px] font-medium text-[#6B7280] bg-[#E8EEF8] px-1.5 py-0.5 rounded-full">
                                aggregate
                              </span>
                            </span>
                          ) : (
                            pl
                          )}
                        </td>

                        {/* Annual target */}
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input
                              type="number"
                              step={config.inputStep}
                              min={config.inputMin}
                              value={editValue}
                              autoFocus
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(metricType, pl)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit(metricType, pl);
                                if (e.key === 'Escape') setEditingKey(null);
                              }}
                              className="border border-[#1E5BC6] rounded px-2 py-0.5 text-sm w-32 focus:outline-none"
                              disabled={saving}
                            />
                          ) : (
                            <span
                              className={`tabular-nums ${existing ? 'text-[#0D2761] font-semibold' : 'text-[#6B7280] italic'} ${canEdit ? 'cursor-pointer hover:text-[#1E5BC6]' : ''}`}
                              onClick={() => canEdit && startEdit(metricType, pl)}
                            >
                              {existing ? config.format(existing.annualTarget) : '—'}
                            </span>
                          )}
                        </td>

                        {/* Last updated */}
                        <td className="px-4 py-3 text-xs text-[#6B7280]">
                          {formatUpdatedAt(existing?.updatedAt ?? null)}
                        </td>

                        {/* Updated by */}
                        <td className="px-4 py-3 text-xs text-[#6B7280]">
                          {existing?.setBy ?? '—'}
                        </td>

                        {/* Actions */}
                        {canEdit && (
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <button
                                onClick={() => setEditingKey(null)}
                                className="text-xs text-[#6B7280] hover:text-[#0D2761]"
                              >
                                Cancel
                              </button>
                            ) : (
                              <button
                                onClick={() => startEdit(metricType, pl)}
                                className="px-3 py-1 text-xs font-medium text-[#0D2761] border border-[#0D2761]/30 rounded-md hover:bg-[#0D2761]/5 transition-colors"
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
