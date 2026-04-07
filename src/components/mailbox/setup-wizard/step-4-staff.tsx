'use client';

import { useState, useEffect } from 'react';
import { Trash2, Plus } from 'lucide-react';

interface StaffMember {
  id?: string;
  name: string;
  email: string;
  isTeamLeader: boolean;
}

interface Props {
  mailboxId: string;
  onNext: () => void;
  onBack: () => void;
}

export function Step4Staff({ mailboxId, onNext, onBack }: Props) {
  const [staff, setStaff] = useState<StaffMember[]>([
    { name: '', email: '', isTeamLeader: false },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/mailbox/staff?mailboxId=${mailboxId}`)
      .then(r => r.json() as Promise<StaffMember[]>)
      .then(data => { if (data.length > 0) setStaff(data); })
      .catch(() => {});
  }, [mailboxId]);

  function addMember() {
    setStaff(prev => [...prev, { name: '', email: '', isTeamLeader: false }]);
  }

  function removeMember(index: number) {
    setStaff(prev => prev.filter((_, i) => i !== index));
  }

  function updateMember(index: number, field: keyof StaffMember, value: string | boolean) {
    setStaff(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }

  async function handleSave() {
    const valid = staff.filter(s => s.name.trim() && s.email.trim());
    if (valid.length === 0) {
      setError('Add at least one staff member.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const existing = await fetch(`/api/mailbox/staff?mailboxId=${mailboxId}`).then(r => r.json() as Promise<{ id: string }[]>);
      for (const s of existing) {
        await fetch(`/api/mailbox/staff?id=${s.id}`, { method: 'DELETE' });
      }

      for (let i = 0; i < valid.length; i++) {
        await fetch('/api/mailbox/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...valid[i], mailboxId, roundRobinOrder: i, isInRoundRobin: true }),
        });
      }
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-[#0D2761]">Step 4: Staff</h2>
        <p className="text-sm text-[#6B7280] mt-1">Add team members who will handle routed emails.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-3">
        {staff.map((member, i) => (
          <div key={i} className="flex items-center gap-3 p-3 border border-[#E8EEF8] rounded-lg">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Full name *"
                value={member.name}
                onChange={e => updateMember(i, 'name', e.target.value)}
                className="border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
              />
              <input
                type="email"
                placeholder="Email address *"
                value={member.email}
                onChange={e => updateMember(i, 'email', e.target.value)}
                className="border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={member.isTeamLeader}
                onChange={e => updateMember(i, 'isTeamLeader', e.target.checked)}
                className="w-4 h-4 accent-[#1E5BC6]"
              />
              <span className="text-xs text-[#6B7280]">Team Leader</span>
            </label>
            <button
              onClick={() => removeMember(i)}
              className="text-[#6B7280] hover:text-red-600 transition-colors flex-shrink-0"
            >
              <Trash2 className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addMember}
        className="flex items-center gap-2 text-sm text-[#1E5BC6] font-medium hover:text-[#0D2761] transition-colors"
      >
        <Plus className="w-4 h-4" strokeWidth={2} />
        Add staff member
      </button>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-[#E8EEF8] text-[#6B7280] text-sm font-medium rounded-lg hover:bg-[#F4F6FA] transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-5 py-2 bg-[#1E5BC6] text-white text-sm font-medium rounded-lg hover:bg-[#0D2761] disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save & Continue'}
        </button>
      </div>
    </div>
  );
}
