'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CheckSquare, Square, Plus, Trash2, ExternalLink, Upload, FileText, FileSpreadsheet, File } from 'lucide-react';
import { hasPermission } from '@/types/roles';
import type { UserRole } from '@/types/roles';

type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'BLOCKED' | 'COMPLETE';
type ProjectPriority = 'HIGH' | 'MEDIUM' | 'LOW';

interface Milestone { id: string; title: string; dueDate: string; isComplete: boolean; completedAt: string | null }
interface Deliverable { id: string; title: string; isComplete: boolean; completedAt: string | null; completedBy: string | null; displayOrder: number }
interface Update { id: string; authorId: string; authorName: string; body: string; createdAt: string }
interface Document { id: string; title: string; description: string | null; fileUrl: string; fileType: string; fileSizeKb: number | null; createdAt: string }
interface LiveMetric { label: string; value: string; target?: string }

interface ProjectData {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  ownerName: string;
  ownerId: string;
  pillarLink: string | null;
  metricLink: string | null;
  startDate: string | null;
  dueDate: string | null;
  milestones: Milestone[];
  deliverables: Deliverable[];
  updates: Update[];
  documents: Document[];
  liveMetric: LiveMetric | null;
}

const STATUS_OPTIONS: ProjectStatus[] = ['PLANNING', 'ACTIVE', 'BLOCKED', 'COMPLETE'];
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

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function FileIcon({ type }: { type: string }) {
  if (type === 'pdf') return <FileText className="w-5 h-5 text-[#991B1B]" strokeWidth={2} />;
  if (['xlsx', 'xls', 'csv'].includes(type)) return <FileSpreadsheet className="w-5 h-5 text-[#065F46]" strokeWidth={2} />;
  return <File className="w-5 h-5 text-[#6B7280]" strokeWidth={2} />;
}

function metricVariant(metric: LiveMetric): string {
  if (!metric.target) return 'text-[#0D2761]';
  const val = parseFloat(metric.value);
  const tgt = parseFloat(metric.target);
  if (isNaN(val) || isNaN(tgt)) return 'text-[#0D2761]';
  if (val <= tgt) return 'text-[#065F46]';
  if (val <= tgt * 1.1) return 'text-[#92400E]';
  return 'text-[#991B1B]';
}

export function ProjectDetail({ id, role, userId: _userId }: { id: string; role: UserRole; userId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');
  const [newDeliverable, setNewDeliverable] = useState('');
  const [updateBody, setUpdateBody] = useState('');
  const [postingUpdate, setPostingUpdate] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const canDelete = hasPermission(role, 'canDeleteProjects');

  const load = useCallback(async () => {
    const res = await fetch(`/api/operations/projects/${id}`);
    if (res.ok) {
      const { project: p } = await res.json();
      setProject(p);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function patchProject(data: Partial<ProjectData>) {
    const res = await fetch(`/api/operations/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const { project: p } = await res.json();
      setProject(prev => prev ? { ...prev, ...p } : prev);
    }
  }

  async function toggleMilestone(milestoneId: string, isComplete: boolean) {
    await fetch(`/api/operations/projects/${id}/milestones`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestoneId, isComplete }),
    });
    load();
  }

  async function addMilestone() {
    if (!newMilestoneTitle.trim() || !newMilestoneDate) return;
    await fetch(`/api/operations/projects/${id}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newMilestoneTitle.trim(), dueDate: newMilestoneDate }),
    });
    setNewMilestoneTitle('');
    setNewMilestoneDate('');
    load();
  }

  async function toggleDeliverable(deliverableId: string, isComplete: boolean) {
    await fetch(`/api/operations/projects/${id}/deliverables`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliverableId, isComplete }),
    });
    load();
  }

  async function addDeliverable() {
    if (!newDeliverable.trim()) return;
    await fetch(`/api/operations/projects/${id}/deliverables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newDeliverable.trim() }),
    });
    setNewDeliverable('');
    load();
  }

  async function postUpdate() {
    if (!updateBody.trim()) return;
    setPostingUpdate(true);
    await fetch(`/api/operations/projects/${id}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: updateBody.trim() }),
    });
    setUpdateBody('');
    setPostingUpdate(false);
    load();
  }

  async function uploadFile(file: File) {
    setUploadingDoc(true);
    const fd = new FormData();
    fd.append('file', file);
    await fetch(`/api/operations/projects/${id}/documents`, { method: 'POST', body: fd });
    setUploadingDoc(false);
    load();
  }

  async function deleteDoc(documentId: string) {
    await fetch(`/api/operations/projects/${id}/documents`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId }),
    });
    load();
  }

  async function handleDeleteProject() {
    await fetch(`/api/operations/projects/${id}`, { method: 'DELETE' });
    router.push('/operations/projects');
  }

  if (loading) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-[#F4F6FA] rounded-xl animate-pulse" />)}</div>;
  }

  if (!project) {
    return <div className="text-sm text-[#991B1B]">Project not found.</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left column (2/3) */}
      <div className="lg:col-span-2 space-y-6">
        {/* Header */}
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <div className="flex items-start gap-3 mb-3">
            <select
              value={project.status}
              onChange={e => patchProject({ status: e.target.value as ProjectStatus })}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-0 ${STATUS_STYLES[project.status]}`}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
            </select>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_STYLES[project.priority]}`}>
              {project.priority}
            </span>
          </div>
          <h1 className="text-xl font-bold text-[#0D2761] mb-1">{project.title}</h1>
          <div className="text-xs text-[#6B7280] space-x-3">
            <span>Owner: {project.ownerName}</span>
            {project.startDate && <span>Start: {fmt(project.startDate)}</span>}
            {project.dueDate && <span>Due: {fmt(project.dueDate)}</span>}
          </div>
          {project.description && (
            <p className="text-sm text-[#374151] mt-3 leading-relaxed">{project.description}</p>
          )}
        </div>

        {/* Milestones */}
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#0D2761] mb-3">Milestones</h2>
          {project.milestones.length === 0 && <p className="text-xs text-[#6B7280] mb-3">No milestones yet.</p>}
          <div className="space-y-2 mb-4">
            {project.milestones.map(m => {
              const overdue = !m.isComplete && new Date(m.dueDate) < new Date();
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <button onClick={() => toggleMilestone(m.id, !m.isComplete)} className="flex-shrink-0">
                    {m.isComplete
                      ? <CheckSquare className="w-4 h-4 text-[#1E5BC6]" strokeWidth={2} />
                      : <Square className="w-4 h-4 text-[#6B7280]" strokeWidth={2} />}
                  </button>
                  <span className={`text-sm flex-1 ${m.isComplete ? 'line-through text-[#6B7280]' : 'text-[#0D2761]'}`}>
                    {m.title}
                  </span>
                  <span className={`text-[11px] flex-shrink-0 ${overdue ? 'text-[#991B1B] font-semibold' : 'text-[#6B7280]'}`}>
                    {fmt(m.dueDate)}{overdue ? ' — overdue' : ''}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 pt-3 border-t border-[#E8EEF8]">
            <input
              value={newMilestoneTitle}
              onChange={e => setNewMilestoneTitle(e.target.value)}
              placeholder="Milestone title"
              className="flex-1 border border-[#E8EEF8] rounded-lg px-3 py-1.5 text-xs text-[#0D2761] focus:outline-none focus:border-[#1E5BC6]"
              onKeyDown={e => e.key === 'Enter' && addMilestone()}
            />
            <input
              type="date"
              value={newMilestoneDate}
              onChange={e => setNewMilestoneDate(e.target.value)}
              className="border border-[#E8EEF8] rounded-lg px-3 py-1.5 text-xs text-[#0D2761] focus:outline-none focus:border-[#1E5BC6]"
            />
            <button
              onClick={addMilestone}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0D2761] text-white hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> Add
            </button>
          </div>
        </div>

        {/* Deliverables */}
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#0D2761] mb-3">Deliverables</h2>
          {project.deliverables.length === 0 && <p className="text-xs text-[#6B7280] mb-3">No deliverables yet.</p>}
          <div className="space-y-2 mb-4">
            {project.deliverables.map(d => (
              <div key={d.id} className="flex items-center gap-3">
                <button onClick={() => toggleDeliverable(d.id, !d.isComplete)} className="flex-shrink-0">
                  {d.isComplete
                    ? <CheckSquare className="w-4 h-4 text-[#065F46]" strokeWidth={2} />
                    : <Square className="w-4 h-4 text-[#6B7280]" strokeWidth={2} />}
                </button>
                <span className={`text-sm flex-1 ${d.isComplete ? 'line-through text-[#6B7280]' : 'text-[#0D2761]'}`}>
                  {d.title}
                </span>
                {d.isComplete && d.completedAt && (
                  <span className="text-[11px] text-[#6B7280] flex-shrink-0">{fmt(d.completedAt)}</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-3 border-t border-[#E8EEF8]">
            <input
              value={newDeliverable}
              onChange={e => setNewDeliverable(e.target.value)}
              placeholder="Add a deliverable"
              className="flex-1 border border-[#E8EEF8] rounded-lg px-3 py-1.5 text-xs text-[#0D2761] focus:outline-none focus:border-[#1E5BC6]"
              onKeyDown={e => e.key === 'Enter' && addDeliverable()}
            />
            <button
              onClick={addDeliverable}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0D2761] text-white hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> Add
            </button>
          </div>
        </div>

        {/* Updates */}
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#0D2761] mb-3">Updates & notes</h2>
          <div className="mb-4">
            <textarea
              value={updateBody}
              onChange={e => setUpdateBody(e.target.value)}
              rows={3}
              placeholder="Add an update or note…"
              className="w-full border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:border-[#1E5BC6] resize-none"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={postUpdate}
                disabled={postingUpdate || !updateBody.trim()}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#F5A800', color: '#0D2761' }}
              >
                {postingUpdate ? 'Posting…' : 'Post update'}
              </button>
            </div>
          </div>
          {project.updates.length === 0 && <p className="text-xs text-[#6B7280]">No updates yet.</p>}
          <div className="space-y-4">
            {project.updates.map(u => (
              <div key={u.id} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#0D2761] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[#F5A800] text-[10px] font-bold">{getInitials(u.authorName)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-[#0D2761]">{u.authorName}</span>
                    <span className="text-[11px] text-[#6B7280]">{fmtTime(u.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[#374151] leading-relaxed whitespace-pre-wrap">{u.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right column (1/3) */}
      <div className="space-y-5">
        {/* Live metric */}
        {project.liveMetric && (
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-3">Live metric</h2>
            <p className="text-xs text-[#6B7280] mb-1">{project.liveMetric.label}</p>
            <p className={`text-3xl font-bold tabular-nums mb-1 ${metricVariant(project.liveMetric)}`}>
              {project.liveMetric.value}
            </p>
            {project.liveMetric.target && (
              <p className="text-xs text-[#6B7280]">Target: {project.liveMetric.target}</p>
            )}
            {project.pillarLink && (
              <a
                href={`/${project.pillarLink}`}
                className="mt-3 flex items-center gap-1 text-xs font-medium text-[#1E5BC6] hover:underline"
              >
                View in {project.pillarLink} <ExternalLink className="w-3 h-3" strokeWidth={2} />
              </a>
            )}
          </div>
        )}

        {/* Documents */}
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-3">Documents</h2>
          {project.documents.length === 0 && (
            <p className="text-xs text-[#6B7280] mb-3">No documents attached.</p>
          )}
          <div className="space-y-2 mb-4">
            {project.documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-2">
                <FileIcon type={doc.fileType} />
                <div className="flex-1 min-w-0">
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-[#0D2761] hover:text-[#1E5BC6] truncate block"
                  >
                    {doc.title}
                  </a>
                  <p className="text-[11px] text-[#6B7280]">
                    {doc.fileSizeKb ? `${doc.fileSizeKb}KB · ` : ''}{fmt(doc.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => deleteDoc(doc.id)}
                  className="text-[#6B7280] hover:text-[#991B1B] flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>

          {/* Upload zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-[#F5A800] bg-[#F5A800]/5' : 'border-[#E8EEF8] hover:border-[#1E5BC6]/40'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f); }}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadingDoc ? (
              <p className="text-xs text-[#6B7280]">Uploading…</p>
            ) : (
              <>
                <Upload className="w-4 h-4 text-[#6B7280] mx-auto mb-1" strokeWidth={2} />
                <p className="text-xs text-[#6B7280]">Drop file or click to upload</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
            />
          </div>
        </div>

        {/* Delete */}
        {canDelete && (
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-3">Danger zone</h2>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs font-semibold text-[#991B1B] hover:underline"
              >
                Delete project
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-[#991B1B]">This will permanently delete the project and all its data.</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDeleteProject}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#991B1B] text-white hover:opacity-90"
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#6B7280] hover:text-[#0D2761]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
