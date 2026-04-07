'use client';

import { useState, useEffect } from 'react';

interface Category {
  id: string;
  name: string;
  colour: string;
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
}

interface RuleData {
  alwaysUrgent: boolean;
  notifyTeamLeader: boolean;
  autoAcknowledge: boolean;
  tatMinutes: number;
  useRoundRobin: boolean;
  fixedAssigneeEmail: string;
}

interface Props {
  mailboxId: string;
  onNext: () => void;
  onBack: () => void;
}

function defaultRule(): RuleData {
  return {
    alwaysUrgent: false,
    notifyTeamLeader: false,
    autoAcknowledge: false,
    tatMinutes: 1440,
    useRoundRobin: true,
    fixedAssigneeEmail: '',
  };
}

export function Step6Rules({ mailboxId, onNext, onBack }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [rules, setRules] = useState<Record<string, RuleData>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [cats, stf, existingRules] = await Promise.all([
        fetch(`/api/mailbox/categories?mailboxId=${mailboxId}`).then(r => r.json() as Promise<Category[]>),
        fetch(`/api/mailbox/staff?mailboxId=${mailboxId}`).then(r => r.json() as Promise<StaffMember[]>),
        fetch(`/api/mailbox/rules?mailboxId=${mailboxId}`).then(r => r.json() as Promise<Array<{ categoryId: string } & RuleData>>),
      ]);
      setCategories(cats);
      setStaff(stf);

      const ruleMap: Record<string, RuleData> = {};
      for (const cat of cats) {
        const existing = existingRules.find(r => r.categoryId === cat.id);
        ruleMap[cat.id] = existing ? { ...existing } : defaultRule();
      }
      setRules(ruleMap);
    })();
  }, [mailboxId]);

  function updateRule(catId: string, field: keyof RuleData, value: boolean | number | string) {
    setRules(prev => ({ ...prev, [catId]: { ...prev[catId], [field]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      for (const cat of categories) {
        const rule = rules[cat.id] ?? defaultRule();
        await fetch('/api/mailbox/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mailboxId,
            categoryId: cat.id,
            categoryName: cat.name,
            ...rule,
            fixedAssigneeEmail: rule.fixedAssigneeEmail || null,
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
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-[#0D2761]">Step 6: Routing Rules</h2>
        <p className="text-sm text-[#6B7280] mt-1">Configure routing behaviour for each category.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-4">
        {categories.map(cat => {
          const rule = rules[cat.id] ?? defaultRule();
          return (
            <div key={cat.id} className="border border-[#E8EEF8] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.colour }} />
                <span className="text-sm font-semibold text-[#0D2761]">{cat.name}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">TAT (minutes)</label>
                  <input
                    type="number"
                    min={60}
                    value={rule.tatMinutes}
                    onChange={e => updateRule(cat.id, 'tatMinutes', parseInt(e.target.value) || 1440)}
                    className="border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
                  />
                </div>

                {!rule.useRoundRobin && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Fixed assignee</label>
                    <select
                      value={rule.fixedAssigneeEmail}
                      onChange={e => updateRule(cat.id, 'fixedAssigneeEmail', e.target.value)}
                      className="border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
                    >
                      <option value="">Select staff…</option>
                      {staff.map(s => <option key={s.id} value={s.email}>{s.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-4">
                {([
                  ['alwaysUrgent', 'Always urgent'],
                  ['notifyTeamLeader', 'Notify team leader'],
                  ['autoAcknowledge', 'Auto-acknowledge'],
                  ['useRoundRobin', 'Round robin'],
                ] as [keyof RuleData, string][]).map(([field, label]) => (
                  <label key={field} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule[field] as boolean}
                      onChange={e => updateRule(cat.id, field, e.target.checked)}
                      className="w-4 h-4 accent-[#1E5BC6]"
                    />
                    <span className="text-sm text-[#0D2761]">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
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
