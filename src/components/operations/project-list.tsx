'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';
import { hasPermission } from '@/types/roles';
import type { UserRole } from '@/types/roles';

type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'BLOCKED' | 'COMPLETE';
type ProjectPriority = 'HIGH' | 'MEDIUM' | 'LOW';

interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  ownerId: string;
  ownerName: string;
  dueDate: string | null;
  pillarLink: string | null;
  documentCount: number;
  completedDeliverables: number;
  totalDeliverables: number;
  completedMilestones: number;
  totalMilestones: number;
  nextMilestone: { title: string; dueDate: string } | null;
  lastUpdate: { createdAt: string } | null;
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  BLOCKED: 'Blocked',
  COMPLETE: 'Complete',
};

const STATUS_STYLES: Record<ProjectStatus, string> = {
  PLANNING: 'bg-[#EFF6FF] text-[#1E40AF]',
  ACTIVE: 'bg-[#ECFDF5] text-[#065F46]',
  BLOCKED: 'bg-[#FEF2F2] text-[#991B1B]',
  COMPLETE: 'bg-[#F4F6FA] text-[#6B7280]',
};

const PRIORITY_STYLES: Record<ProjectPriority, string> = {
  HIGH: 'bg-[#FEF2F2] text-[#991B1B]',
  MEDIUM: 'bg-[#FFFBEB] text-[#92400E]',
  LOW: 'bg-[#F4F6FA] text-[#6B7280]',
};

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

const STATUS_FILTERS: (ProjectStatus | 'ALL')[] = ['ALL', 'PLANNING', 'ACTIVE', 'BLOCKED', 'COMPLETE'];

export function ProjectList({ role, userId: _userId }: { role: UserRole; userId: string }) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'ALL'>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [profiles, setProfiles] = useState<{ id: string; fullName: string | null; email: string }[]>([]);

  // New project form state
  const [form, setForm] = useState({
    title: '', description: '', priority: 'MEDIUM' as ProjectPriority,
    ownerId: '', startDate: '', dueDate: '', pillarLink: '',
  });
  const [saving, setSaving] = useState(false);

  const canCreate = hasPermission(role, 'canCreateProjects');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    const res = await fetch(`/api/operations/projects?${params}`);
    if (res.ok) {
      const { projects: p } = await res.json();
      setProjects(p);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showModal) return;
    fetch('/api/admin/users').then(r => r.json()).then(d => {
      setProfiles(d.users ?? []);
    }).catch(() => {});
  }, [showModal]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const res = await fetch('/api/operations/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        pillarLink: form.pillarLink || null,
        ownerId: form.ownerId || undefined,
      }),
    });
    if (res.ok) {
      const { project } = await res.json();
      setShowModal(false);
      router.push(`/operations/projects/${project.id}`);
    }
    setSaving(false);
  }

  return (
    <div>
      <BackButton label="Back to Operations" href="/operations" />
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#0D2761]">Projects</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">Track business initiatives, milestones and deliverables.</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#F5A800', color: '#0D2761' }}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            New project
          </button>
        )}
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              statusFilter === s
                ? 'bg-[#0D2761] text-white'
                : 'bg-[#F4F6FA] text-[#6B7280] hover:bg-[#E8EEF8]'
            }`}
          >
            {s === 'ALL' ? 'All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Project cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-[#F4F6FA] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-[#6B7280]">
          <p className="text-sm">No projects found.</p>
          {canCreate && (
            <button
              onClick={() => setShowModal(true)}
              className="mt-3 text-sm font-medium text-[#1E5BC6] hover:underline"
            >
              Create the first project
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(p => {
            const progress = p.totalDeliverables > 0
              ? Math.round((p.completedDeliverables / p.totalDeliverables) * 100)
              : 0;
            return (
              <div
                key={p.id}
                onClick={() => router.push(`/operations/projects/${p.id}`)}
                className="bg-white border border-[#E8EEF8] rounded-xl p-5 hover:border-[#1E5BC6] hover:shadow-sm transition-all duration-150 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_STYLES[p.priority]}`}>
                      {p.priority}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-[#0D2761] flex items-center justify-center flex-shrink-0">
                    <span className="text-[#F5A800] text-[10px] font-bold">{getInitials(p.ownerName)}</span>
                  </div>
                </div>

                <h2 className="text-sm font-semibold text-[#0D2761] mb-1">{p.title}</h2>

                <div className="text-xs text-[#6B7280] mb-3">
                  {p.dueDate && <span>Due: {new Date(p.dueDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })} · </span>}
                  <span>Owner: {p.ownerName}</span>
                </div>

                {p.totalDeliverables > 0 && (
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1 h-1.5 bg-[#E8EEF8] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#1E5BC6] transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-[#6B7280] flex-shrink-0">
                      {p.completedDeliverables}/{p.totalDeliverables} deliverables
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 text-[11px] text-[#6B7280] flex-wrap">
                  {p.nextMilestone && (
                    <span>Next: {p.nextMilestone.title} — {new Date(p.nextMilestone.dueDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</span>
                  )}
                  {p.documentCount > 0 && <span>{p.documentCount} doc{p.documentCount !== 1 ? 's' : ''}</span>}
                  {p.pillarLink && (
                    <span className="px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1E40AF] text-[10px] font-medium capitalize">
                      {p.pillarLink}
                    </span>
                  )}
                  {p.lastUpdate && <span>Updated {timeAgo(p.lastUpdate.createdAt)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New project modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EEF8]">
              <h2 className="text-base font-semibold text-[#0D2761]">New project</h2>
              <button onClick={() => setShowModal(false)} className="text-[#6B7280] hover:text-[#0D2761]">
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-[#0D2761] mb-1">Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:border-[#1E5BC6]"
                  placeholder="Project title"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0D2761] mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:border-[#1E5BC6] resize-none"
                  placeholder="What is this project about?"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#0D2761] mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value as ProjectPriority }))}
                    className="w-full border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:border-[#1E5BC6]"
                  >
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0D2761] mb-1">Link to pillar</label>
                  <select
                    value={form.pillarLink}
                    onChange={e => setForm(f => ({ ...f, pillarLink: e.target.value }))}
                    className="w-full border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:border-[#1E5BC6]"
                  >
                    <option value="">None</option>
                    <option value="claims">Claims</option>
                    <option value="finance">Finance</option>
                    <option value="mailbox">Mailbox</option>
                    <option value="underwriting">Underwriting</option>
                    <option value="operations">Operations</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#0D2761] mb-1">Start date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:border-[#1E5BC6]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0D2761] mb-1">Due date</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="w-full border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:border-[#1E5BC6]"
                  />
                </div>
              </div>
              {profiles.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[#0D2761] mb-1">Owner</label>
                  <select
                    value={form.ownerId}
                    onChange={e => setForm(f => ({ ...f, ownerId: e.target.value }))}
                    className="w-full border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:border-[#1E5BC6]"
                  >
                    <option value="">Me (default)</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.fullName ?? p.email}</option>
                    ))}
                  </select>
                </div>
              )}
            </form>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E8EEF8] bg-[#F4F6FA]">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-[#6B7280] hover:text-[#0D2761] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !form.title.trim()}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#F5A800', color: '#0D2761' }}
              >
                {saving ? 'Creating…' : 'Create project →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
