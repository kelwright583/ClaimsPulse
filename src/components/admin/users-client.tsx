'use client';

import { useState, useEffect } from 'react';
import { formatDate } from '@/lib/utils';
import type { UserRole } from '@/types/roles';
import { ROLE_LABELS } from '@/types/roles';

interface UserRow {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
}

const ROLE_OPTIONS: UserRole[] = [
  'SENIOR_MANAGEMENT',
  'HEAD_OF_CLAIMS',
  'TEAM_LEADER',
  'CLAIMS_TECHNICIAN',
  'TP_HANDLER',
  'SALVAGE_HANDLER',
];

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function UsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // userId being saved
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => setUsers(d.users ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleRoleChange(userId: string, newRole: string) {
    setSaving(userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error ?? 'Request failed');
      }
      const data = await res.json();
      const updated = data.user as { id: string; email: string; fullName: string | null; role: string };
      setUsers(prev =>
        prev.map(u => (u.id === updated.id ? { ...u, role: updated.role } : u))
      );
      showToast(`Role updated to ${ROLE_LABELS[updated.role as UserRole] ?? updated.role}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update role', 'error');
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[#0D2761]/60">Loading users…</p>
      </div>
    );
  }

  return (
    <div>
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg transition-all ${
            toast.type === 'success'
              ? 'bg-[#0D2761] text-white'
              : 'bg-[#991B1B] text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">User Management</h1>
        <p className="text-sm text-[#0D2761]/60 mt-1">
          Manage user roles and access levels. Head of Claims only.
        </p>
      </div>

      {/* Summary chip */}
      <div className="mb-5">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#0D2761]/8 text-[#0D2761]">
          <span className="font-semibold">{users.length}</span>
          {users.length === 1 ? 'user' : 'users'}
        </span>
      </div>

      {users.length === 0 ? (
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-12 text-center">
          <p className="text-sm font-medium text-[#0D2761]">No users found</p>
          <p className="text-xs text-[#0D2761]/50 mt-1">Users will appear here once they have signed in.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E8EEF8] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(13,39,97,0.06)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-[#E8EEF8]">
                  {['User', 'Email', 'Role', 'Created', 'Change Role'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-[#0D2761]/60 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user, idx) => {
                  const isSaving = saving === user.id;
                  const roleLabel = ROLE_LABELS[user.role as UserRole] ?? user.role;

                  return (
                    <tr
                      key={user.id}
                      className={`border-b border-[#E8EEF8] last:border-0 transition-colors ${
                        isSaving ? 'bg-[#F4F6FA]' : idx % 2 === 1 ? 'bg-[#F4F6FA]/50' : ''
                      }`}
                    >
                      {/* User / Full Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#0D2761]/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-[#0D2761]">
                              {getInitials(user.fullName)}
                            </span>
                          </div>
                          <span className="font-medium text-[#0D2761] whitespace-nowrap">
                            {user.fullName ?? '—'}
                          </span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 text-[#0D2761]/70 whitespace-nowrap">
                        {user.email}
                      </td>

                      {/* Current role badge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-[#F5A800]/15 text-[#92400E]">
                          {roleLabel}
                        </span>
                      </td>

                      {/* Created date */}
                      <td className="px-4 py-3 text-xs text-[#0D2761]/60 whitespace-nowrap">
                        {formatDate(user.createdAt)}
                      </td>

                      {/* Role change select */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={user.role}
                            disabled={isSaving}
                            onChange={e => handleRoleChange(user.id, e.target.value)}
                            className="px-2.5 py-1.5 text-xs font-medium text-[#0D2761] bg-white border border-[#E8EEF8] rounded-lg focus:outline-none focus:border-[#0D2761]/40 disabled:opacity-50 disabled:cursor-not-allowed hover:border-[#0D2761]/30 transition-colors"
                          >
                            {ROLE_OPTIONS.map(r => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                          {isSaving && (
                            <span className="text-xs text-[#0D2761]/50">Saving…</span>
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
      )}
    </div>
  );
}
