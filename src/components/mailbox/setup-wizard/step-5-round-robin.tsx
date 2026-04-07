'use client';

import { useState, useEffect } from 'react';
import { GripVertical } from 'lucide-react';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  isInRoundRobin: boolean;
  roundRobinOrder: number | null;
}

interface Props {
  mailboxId: string;
  onNext: () => void;
  onBack: () => void;
}

export function Step5RoundRobin({ mailboxId, onNext, onBack }: Props) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/mailbox/staff?mailboxId=${mailboxId}`)
      .then(r => r.json() as Promise<StaffMember[]>)
      .then(data => setStaff(data.sort((a, b) => (a.roundRobinOrder ?? 0) - (b.roundRobinOrder ?? 0))))
      .catch(() => {});
  }, [mailboxId]);

  function toggleInRoundRobin(id: string) {
    setStaff(prev => prev.map(s => s.id === id ? { ...s, isInRoundRobin: !s.isInRoundRobin } : s));
  }

  function moveUp(index: number) {
    if (index === 0) return;
    setStaff(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    setStaff(prev => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      for (let i = 0; i < staff.length; i++) {
        await fetch('/api/mailbox/staff', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: staff[i].id,
            isInRoundRobin: staff[i].isInRoundRobin,
            roundRobinOrder: i,
          }),
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
    <div className="space-y-5 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-[#0D2761]">Step 5: Round Robin Order</h2>
        <p className="text-sm text-[#6B7280] mt-1">Set the order for round-robin assignment and toggle who is in the pool.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-2">
        {staff.map((member, i) => (
          <div
            key={member.id}
            className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${
              member.isInRoundRobin ? 'border-[#1E5BC6] bg-[#EEF3FC]' : 'border-[#E8EEF8] bg-[#F4F6FA] opacity-60'
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <button onClick={() => moveUp(i)} disabled={i === 0} className="text-[#6B7280] hover:text-[#0D2761] disabled:opacity-20 text-xs">▲</button>
              <button onClick={() => moveDown(i)} disabled={i === staff.length - 1} className="text-[#6B7280] hover:text-[#0D2761] disabled:opacity-20 text-xs">▼</button>
            </div>
            <GripVertical className="w-4 h-4 text-[#6B7280]" strokeWidth={2} />
            <div className="flex-1">
              <div className="text-sm font-medium text-[#0D2761]">{member.name}</div>
              <div className="text-xs text-[#6B7280]">{member.email}</div>
            </div>
            <span className="text-xs text-[#6B7280] w-6 text-center font-bold">{i + 1}</span>
            <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={member.isInRoundRobin}
                onChange={() => toggleInRoundRobin(member.id)}
                className="w-4 h-4 accent-[#1E5BC6]"
              />
              <span className="text-xs text-[#6B7280]">In pool</span>
            </label>
          </div>
        ))}
      </div>

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
