'use client';

import { useState, useEffect } from 'react';
import { formatDate } from '@/lib/utils';

interface SlaConfigRow {
  id: string;
  secondaryStatus: string;
  maxDays: number;
  alertRole: string;
  priority: string;
  isActive: boolean;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

interface EditState {
  maxDays: number;
  alertRole: string;
  priority: string;
  isActive: boolean;
}

const PRIORITY_OPTIONS = ['critical', 'urgent', 'standard'] as const;
const ALERT_ROLE_OPTIONS = ['handler', 'head_of_claims', 'tp_handler', 'both'] as const;

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'bg-[#991B1B]/10 text-[#991B1B]',
  urgent: 'bg-[#92400E]/10 text-[#92400E]',
  standard: 'bg-[#0D2761]/10 text-[#0D2761]',
};

export function SlaMatrixClient() {
  const [configs, setConfigs] = useState<SlaConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetch('/api/sla-config')
      .then(r => r.json())
      .then(d => setConfigs(d.configs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function startEdit(row: SlaConfigRow) {
    setEditingId(row.id);
    setEditState({ maxDays: row.maxDays, alertRole: row.alertRole, priority: row.priority, isActive: row.isActive });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditState(null);
  }

  async function saveEdit(row: SlaConfigRow) {
    if (!editState) return;
    setSaving(true);
    try {
      const res = await fetch('/api/sla-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, ...editState }),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated: SlaConfigRow = (await res.json()).config;
      setConfigs(prev => prev.map(c => (c.id === updated.id ? { ...updated, updatedAt: updated.updatedAt } : c)));
      setEditingId(null);
      setEditState(null);
      showToast('Saved', 'success');
    } catch {
      showToast('Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm('Reset all SLA thresholds to default values? This cannot be undone.')) return;
    setResetting(true);
    try {
      const res = await fetch('/api/sla-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      if (!res.ok) throw new Error('Reset failed');
      const data = await res.json();
      setConfigs(data.configs ?? []);
      setEditingId(null);
      showToast('Reset to defaults', 'success');
    } catch {
      showToast('Failed to reset', 'error');
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#6B7280]">Loading SLA configuration…</p>
      </div>
    );
  }

  const criticalCount = configs.filter(c => c.priority === 'critical').length;
  const urgentCount = configs.filter(c => c.priority === 'urgent').length;
  const standardCount = configs.filter(c => c.priority === 'standard').length;

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg ${
          toast.type === 'success'
            ? 'bg-[#065F46] text-white'
            : 'bg-[#991B1B] text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0D2761]">SLA Matrix</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Configure maximum days per secondary claim status.
            Changes apply to all future SLA breach calculations.
          </p>
        </div>
        <button
          onClick={handleReset}
          disabled={resetting}
          className="flex-shrink-0 px-4 py-2 text-sm font-medium text-[#6B7280] border border-[#E8EEF8] rounded-lg hover:bg-[#F4F6FA] transition-colors disabled:opacity-50"
        >
          {resetting ? 'Resetting…' : 'Reset to Defaults'}
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex items-center gap-3 mb-6">
        {[
          { label: 'Critical', count: criticalCount, style: PRIORITY_STYLES.critical },
          { label: 'Urgent', count: urgentCount, style: PRIORITY_STYLES.urgent },
          { label: 'Standard', count: standardCount, style: PRIORITY_STYLES.standard },
        ].map(item => (
          <span key={item.label} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${item.style}`}>
            <span className="font-semibold">{item.count}</span>
            {item.label}
          </span>
        ))}
      </div>

      <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">Secondary Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide w-28">Max Days</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide w-44">Alert Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide w-32">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide w-20">Active</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide w-32">Updated</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {configs.map((row, idx) => {
                const isEditing = editingId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-[#E8EEF8] last:border-0 ${isEditing ? 'bg-[#0D2761]/3' : idx % 2 === 1 ? 'bg-[#F4F6FA]/40' : ''}`}
                  >
                    <td className="px-4 py-3 text-[#0D2761] font-medium">{row.secondaryStatus}</td>

                    {/* Max days */}
                    <td className="px-4 py-3">
                      {isEditing && editState ? (
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={editState.maxDays}
                          onChange={e => setEditState(s => s ? { ...s, maxDays: Number(e.target.value) } : s)}
                          className="w-16 px-2 py-1 border border-[#0D2761] rounded-md text-sm text-center focus:outline-none"
                        />
                      ) : (
                        <span className="tabular-nums text-[#0D2761] font-semibold">{row.maxDays}</span>
                      )}
                    </td>

                    {/* Alert role */}
                    <td className="px-4 py-3">
                      {isEditing && editState ? (
                        <select
                          value={editState.alertRole}
                          onChange={e => setEditState(s => s ? { ...s, alertRole: e.target.value } : s)}
                          className="px-2 py-1 border border-[#0D2761] rounded-md text-sm focus:outline-none"
                        >
                          {ALERT_ROLE_OPTIONS.map(r => (
                            <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[#6B7280]">{row.alertRole.replace(/_/g, ' ')}</span>
                      )}
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3">
                      {isEditing && editState ? (
                        <select
                          value={editState.priority}
                          onChange={e => setEditState(s => s ? { ...s, priority: e.target.value } : s)}
                          className="px-2 py-1 border border-[#0D2761] rounded-md text-sm focus:outline-none"
                        >
                          {PRIORITY_OPTIONS.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_STYLES[row.priority] ?? ''}`}>
                          {row.priority}
                        </span>
                      )}
                    </td>

                    {/* Active */}
                    <td className="px-4 py-3">
                      {isEditing && editState ? (
                        <input
                          type="checkbox"
                          checked={editState.isActive}
                          onChange={e => setEditState(s => s ? { ...s, isActive: e.target.checked } : s)}
                          className="w-4 h-4 rounded border-[#E8EEF8] accent-[#0D2761]"
                        />
                      ) : (
                        <span className={`text-xs font-medium ${row.isActive ? 'text-[#065F46]' : 'text-[#6B7280]'}`}>
                          {row.isActive ? 'Yes' : 'No'}
                        </span>
                      )}
                    </td>

                    {/* Updated at */}
                    <td className="px-4 py-3 text-xs text-[#6B7280]">
                      {row.updatedAt ? formatDate(row.updatedAt) : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(row)}
                              disabled={saving}
                              className="px-3 py-1 text-xs font-medium text-white bg-[#0D2761] rounded-md hover:bg-[#1E5BC6] transition-colors disabled:opacity-50"
                            >
                              {saving ? '…' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-3 py-1 text-xs font-medium text-[#6B7280] border border-[#E8EEF8] rounded-md hover:bg-[#F4F6FA] transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => startEdit(row)}
                            className="px-3 py-1 text-xs font-medium text-[#0D2761] border border-[#0D2761]/30 rounded-md hover:bg-[#0D2761]/5 transition-colors"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
