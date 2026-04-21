'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UserRole } from '@/types/roles';

interface ProductLine {
  rawValue: string;
  displayName: string;
  active: boolean;
}

interface Props {
  role: UserRole;
}

export function ProductLinesClient({ role: _role }: Props) {
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRaw, setEditingRaw] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadProductLines = useCallback(() => {
    setLoading(true);
    fetch('/api/reference/product-lines')
      .then(r => r.json())
      .then((data: unknown) => {
        setProductLines(Array.isArray(data) ? (data as ProductLine[]) : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProductLines();
  }, [loadProductLines]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function startEdit(pl: ProductLine) {
    setEditingRaw(pl.rawValue);
    setEditValue(pl.displayName);
  }

  function cancelEdit() {
    setEditingRaw(null);
    setEditValue('');
  }

  async function saveAlias(rawValue: string, displayName: string, active: boolean) {
    setSaving(true);
    try {
      const res = await fetch('/api/reference/product-lines', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawValue, displayName, active }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Product line updated');
      await loadProductLines();
    } catch {
      showToast('Failed to save changes');
    } finally {
      setSaving(false);
      setEditingRaw(null);
    }
  }

  async function commitEdit(rawValue: string, active: boolean) {
    const trimmed = editValue.trim();
    if (!trimmed) {
      cancelEdit();
      return;
    }
    await saveAlias(rawValue, trimmed, active);
  }

  async function toggleActive(pl: ProductLine) {
    await saveAlias(pl.rawValue, pl.displayName, !pl.active);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#6B7280]">Loading product lines...</p>
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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">Product Lines</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Manage display names for product lines derived from import data. Changes take effect immediately in filters and reports.
        </p>
      </div>

      {productLines.length === 0 ? (
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
          <p className="text-sm text-[#6B7280]">
            No product lines found. Import claims or revenue data to populate this list.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8EEF8] bg-[#F4F6FA]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">
                  Raw Value
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide">
                  Display Name
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide w-32">
                  Status
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide w-36">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {productLines.map(pl => {
                const isEditing = editingRaw === pl.rawValue;

                return (
                  <tr
                    key={pl.rawValue}
                    className="border-b border-[#E8EEF8] last:border-0 hover:bg-[#F4F6FA] transition-colors"
                  >
                    {/* Raw Value */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-[#6B7280] bg-[#F4F6FA] border border-[#E8EEF8] px-2 py-0.5 rounded">
                        {pl.rawValue}
                      </span>
                    </td>

                    {/* Display Name */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValue}
                          autoFocus
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitEdit(pl.rawValue, pl.active);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className="border border-[#1E5BC6] rounded px-2 py-0.5 text-sm w-48 focus:outline-none"
                          disabled={saving}
                        />
                      ) : (
                        <span
                          className="text-[#0D2761] font-medium cursor-pointer hover:text-[#1E5BC6]"
                          onClick={() => startEdit(pl)}
                          title="Click to edit"
                        >
                          {pl.displayName}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => !saving && toggleActive(pl)}
                        disabled={saving}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                          pl.active
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-[#E8EEF8] text-[#6B7280] hover:bg-[#D1D9EC]'
                        }`}
                        title={pl.active ? 'Click to deactivate' : 'Click to activate'}
                      >
                        {pl.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => commitEdit(pl.rawValue, pl.active)}
                            disabled={saving}
                            className="px-3 py-1 text-xs font-medium bg-[#0D2761] text-white rounded-md hover:bg-[#1E5BC6] transition-colors disabled:opacity-50"
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={saving}
                            className="text-xs text-[#6B7280] hover:text-[#0D2761]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(pl)}
                          className="px-3 py-1 text-xs font-medium text-[#0D2761] border border-[#0D2761]/30 rounded-md hover:bg-[#0D2761]/5 transition-colors"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
