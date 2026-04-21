'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UserRole } from '@/types/roles';
import { getFyBoundaries } from '@/lib/fiscal';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TargetRow {
  id: string | null;
  metricType: string;
  productLine: string | null;
  uwYear: number;
  annualTarget: number;
  setBy: string | null;
  updatedAt: string | null;
}

interface MonthlyBudgetRow {
  metricType: string;
  monthLabel: string;
  monthIndex: number;
  budgetValue: number;
  uwYear: number;
}

interface Props {
  role: UserRole;
  userId: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

const PERF_METRIC_TYPES = ['loss_ratio', 'net_wp', 'policy_count'] as const;
type PerfMetricType = typeof PERF_METRIC_TYPES[number];

const METRIC_CONFIG: Record<
  PerfMetricType,
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

function formatZar(v: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v);
}

const BUDGET_METRIC_CONFIG: Record<string, { label: string; format: (v: number) => string }> = {
  gwp_budget:              { label: 'Gross Written Premium',   format: (v) => formatZar(v) },
  gross_claims_budget:     { label: 'Gross Claims',            format: (v) => formatZar(v) },
  gross_commission_budget: { label: 'Gross Earned Commission', format: (v) => formatZar(v) },
  expenses_budget:         { label: 'Expenses',                format: (v) => formatZar(v) },
};

const BUDGET_METRIC_TYPES = Object.keys(BUDGET_METRIC_CONFIG);

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCurrentUwYear(): number {
  return getFyBoundaries().uwYear;
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function rowKey(metricType: string, productLine: string | null): string {
  return `${metricType}::${productLine ?? '__all__'}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TargetsClient({ role }: Props) {
  const [uwYear, setUwYear] = useState<number>(getCurrentUwYear());
  const [productLines, setProductLines] = useState<string[]>([]);

  // Section A: performance targets (loss_ratio, net_wp, policy_count)
  const [targets, setTargets] = useState<TargetRow[]>([]);
  // Section B: budget targets (gwp_budget, etc.)
  const [budgetTargets, setBudgetTargets] = useState<TargetRow[]>([]);
  // Section B: monthly breakdown rows
  const [monthlyBudgets, setMonthlyBudgets] = useState<MonthlyBudgetRow[]>([]);
  const [expandedBudgetMetric, setExpandedBudgetMetric] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const canEdit = role === 'HEAD_OF_CLAIMS' || role === 'SENIOR_MANAGEMENT';

  // ── Data Loading ────────────────────────────────────────────────────────────

  const loadProductLines = useCallback(() => {
    fetch('/api/reference/product-lines')
      .then(r => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setProductLines(
            (data as Array<{ rawValue: string; active: boolean }>)
              .filter(pl => pl.active)
              .map(pl => pl.rawValue)
          );
        }
      })
      .catch(() => {});
  }, []);

  const loadTargets = useCallback(() => {
    setLoading(true);
    fetch('/api/targets')
      .then(r => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          const all = data as TargetRow[];
          setTargets(all.filter(t => PERF_METRIC_TYPES.includes(t.metricType as PerfMetricType)));
          setBudgetTargets(all.filter(t => BUDGET_METRIC_TYPES.includes(t.metricType)));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadMonthlyBudgets = useCallback(() => {
    fetch(`/api/reference/monthly-budgets?uwYear=${uwYear}`)
      .then(r => r.json())
      .then((data: unknown) => {
        setMonthlyBudgets(Array.isArray(data) ? (data as MonthlyBudgetRow[]) : []);
      })
      .catch(() => {});
  }, [uwYear]);

  useEffect(() => {
    loadProductLines();
  }, [loadProductLines]);

  useEffect(() => {
    loadTargets();
    loadMonthlyBudgets();
  }, [loadTargets, loadMonthlyBudgets]);

  // ── Toast ───────────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // ── Section A helpers ───────────────────────────────────────────────────────

  function getTarget(metricType: PerfMetricType, productLine: string | null): TargetRow | undefined {
    return targets.find(
      t => t.metricType === metricType && t.productLine === productLine && t.uwYear === uwYear
    );
  }

  function startEdit(metricType: PerfMetricType, productLine: string | null) {
    if (!canEdit) return;
    const existing = getTarget(metricType, productLine);
    setEditingKey(rowKey(metricType, productLine));
    setEditValue(existing ? String(existing.annualTarget) : '');
  }

  async function commitEdit(metricType: PerfMetricType, productLine: string | null) {
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
      showToast('Target saved');
      await loadTargets();
    } catch {
      showToast('Failed to save target');
    } finally {
      setSaving(false);
      setEditingKey(null);
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const currentYear = getCurrentUwYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];
  const hasAnyPerfTargetForYear = targets.some(t => t.uwYear === uwYear);
  const hasBudgetForYear = budgetTargets.some(t => t.uwYear === uwYear);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#6B7280]">Loading targets...</p>
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
            onChange={e => setUwYear(Number(e.target.value))}
            className="px-3 py-1.5 border border-[#E8EEF8] rounded-lg text-sm text-[#0D2761] bg-white focus:outline-none focus:border-[#1E5BC6]"
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>
                {y} {y === currentYear ? '(current)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── SECTION A: Performance Targets ────────────────────────────────── */}
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-base font-semibold text-[#0D2761]">A. Performance Targets</h2>
        </div>

        {/* Info banner */}
        <div className="mb-4 flex items-start gap-3 bg-[#1E5BC6]/5 border border-[#1E5BC6]/20 rounded-xl px-4 py-3">
          <div className="mt-0.5 w-4 h-4 flex-shrink-0 rounded-full bg-[#1E5BC6] flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">i</span>
          </div>
          <p className="text-sm text-[#0D2761]">
            These are strategic performance commitments entered by SEB leadership.
          </p>
        </div>

        {!hasAnyPerfTargetForYear && (
          <div className="mb-4 flex items-start gap-3 bg-[#1E5BC6]/5 border border-[#1E5BC6]/20 rounded-xl px-4 py-3">
            <div className="mt-0.5 w-4 h-4 flex-shrink-0 rounded-full bg-[#1E5BC6] flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">i</span>
            </div>
            <p className="text-sm text-[#0D2761]">
              No targets set for this financial year. Enter your annual targets below to activate the Executive dashboard.
            </p>
          </div>
        )}

        {PERF_METRIC_TYPES.map(metricType => {
          const config = METRIC_CONFIG[metricType];
          const productLineRows: Array<string | null> = [null, ...productLines];

          return (
            <div
              key={metricType}
              className="mb-6 bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
            >
              <div className="px-5 py-3 border-b border-[#E8EEF8] bg-[#F4F6FA]">
                <h3 className="text-sm font-semibold text-[#0D2761]">{config.label}</h3>
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
                    {productLineRows.map(pl => {
                      const key = rowKey(metricType, pl);
                      const existing = getTarget(metricType, pl);
                      const isEditing = editingKey === key;

                      return (
                        <tr
                          key={key}
                          className="border-b border-[#E8EEF8] last:border-0 hover:bg-[#F4F6FA] transition-colors"
                        >
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

                          <td className="px-4 py-3">
                            {isEditing ? (
                              <input
                                type="number"
                                step={config.inputStep}
                                min={config.inputMin}
                                value={editValue}
                                autoFocus
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => commitEdit(metricType, pl)}
                                onKeyDown={e => {
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

                          <td className="px-4 py-3 text-xs text-[#6B7280]">
                            {formatUpdatedAt(existing?.updatedAt ?? null)}
                          </td>

                          <td className="px-4 py-3 text-xs text-[#6B7280]">
                            {existing?.setBy ?? '—'}
                          </td>

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

      {/* ── SECTION B: Annual Budget ───────────────────────────────────────── */}
      <div className="mb-8">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-[#0D2761]">B. Annual Budget (from Finance sign-off)</h2>
        </div>

        {/* Yellow banner */}
        <div className="mb-4 flex items-start gap-3 bg-[#F5A800]/10 border border-[#F5A800]/30 rounded-xl px-4 py-3">
          <div className="mt-0.5 w-4 h-4 flex-shrink-0 rounded-full bg-[#F5A800] flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">!</span>
          </div>
          <p className="text-sm text-[#0D2761]">
            Budget figures are sourced from the B2026 sign-off workbook. To update, re-upload via Imports &rarr; Annual Budget.
          </p>
        </div>

        {!hasBudgetForYear ? (
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
            <p className="text-sm text-[#6B7280]">
              No budget uploaded for FY {uwYear}. Upload the sign-off workbook at Imports &rarr; Annual Budget.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8EEF8] bg-[#F4F6FA]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">
                    Budget Metric
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide w-48">
                    Annual Target
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide w-36">
                    Last Updated
                  </th>
                  <th className="px-4 py-2.5 w-48" />
                </tr>
              </thead>
              <tbody>
                {BUDGET_METRIC_TYPES.map(metricType => {
                  const config = BUDGET_METRIC_CONFIG[metricType];
                  const row = budgetTargets.find(
                    t => t.metricType === metricType && t.productLine === null && t.uwYear === uwYear
                  );
                  const isExpanded = expandedBudgetMetric === metricType;
                  const monthlyRows = monthlyBudgets.filter(m => m.metricType === metricType);

                  return (
                    <>
                      <tr
                        key={metricType}
                        className="border-b border-[#E8EEF8] last:border-0 hover:bg-[#F4F6FA] transition-colors"
                      >
                        <td className="px-4 py-3 text-[#0D2761] font-medium">{config.label}</td>
                        <td className="px-4 py-3 font-semibold text-[#0D2761] tabular-nums">
                          {row ? config.format(row.annualTarget) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#6B7280]">
                          {formatUpdatedAt(row?.updatedAt ?? null)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {monthlyRows.length > 0 && (
                            <button
                              onClick={() => setExpandedBudgetMetric(isExpanded ? null : metricType)}
                              className="text-xs text-[#1E5BC6] hover:underline font-medium"
                            >
                              {isExpanded ? 'Hide monthly breakdown' : 'View monthly breakdown'} {isExpanded ? '▴' : '▾'}
                            </button>
                          )}
                        </td>
                      </tr>

                      {isExpanded && monthlyRows.length > 0 && (
                        <tr key={`${metricType}-monthly`} className="border-b border-[#E8EEF8] bg-[#F4F6FA]/50">
                          <td colSpan={4} className="px-4 py-3">
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr>
                                    {monthlyRows
                                      .sort((a, b) => a.monthIndex - b.monthIndex)
                                      .map(m => (
                                        <th
                                          key={m.monthIndex}
                                          className="px-2 py-1.5 text-center font-semibold text-[#6B7280] uppercase tracking-wide"
                                        >
                                          {m.monthLabel}
                                        </th>
                                      ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    {monthlyRows
                                      .sort((a, b) => a.monthIndex - b.monthIndex)
                                      .map(m => (
                                        <td
                                          key={m.monthIndex}
                                          className="px-2 py-1.5 text-center text-[#0D2761] tabular-nums font-medium"
                                        >
                                          {config.format(m.budgetValue)}
                                        </td>
                                      ))}
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SECTION C: Operational Targets (placeholder) ───────────────────── */}
      <div className="mb-8">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-[#0D2761]">C. Operational Targets</h2>
        </div>

        {/* Info banner */}
        <div className="mb-4 flex items-start gap-3 bg-[#1E5BC6]/5 border border-[#1E5BC6]/20 rounded-xl px-4 py-3">
          <div className="mt-0.5 w-4 h-4 flex-shrink-0 rounded-full bg-[#1E5BC6] flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">i</span>
          </div>
          <p className="text-sm text-[#0D2761]">
            Operational monthly targets are derived automatically from your Annual Budget and Policy Count targets — see the Underwriting and Strategic dashboards for live calculations.
          </p>
        </div>

        {/* Greyed-out placeholder table */}
        <div
          className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)] opacity-40 pointer-events-none"
          aria-hidden="true"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8EEF8] bg-[#F4F6FA]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">
                  Operational Target
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#E8EEF8]">
                <td className="px-4 py-3 text-[#0D2761] font-medium">Target policies onboarded per month</td>
                <td className="px-4 py-3 text-[#6B7280] italic text-xs">Derived from Policy Count target &divide; 12</td>
              </tr>
              <tr className="border-b border-[#E8EEF8]">
                <td className="px-4 py-3 text-[#0D2761] font-medium">Target average premium per policy</td>
                <td className="px-4 py-3 text-[#6B7280] italic text-xs">Derived from GWP Budget &divide; Policy Count target</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-[#0D2761] font-medium">Target TAT compliance %</td>
                <td className="px-4 py-3 text-[#6B7280] italic text-xs">Set via Claims TAT Matrix</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
