'use client';

import { useState, useEffect } from 'react';

interface Category {
  id: string;
  name: string;
  colour: string;
}

interface Rule {
  id: string;
  categoryId: string;
  autoAcknowledge: boolean;
  acknowledgeTemplate: string | null;
}

interface Props {
  mailboxId: string;
  onNext: () => void;
  onBack: () => void;
}

const VARIABLE_HINTS = ['{sender_name}', '{subject}', '{assigned_to}', '{date_received}'];

const DEFAULT_TEMPLATE = `Dear {sender_name},

Thank you for contacting the SEB Claims team. We have received your email regarding "{subject}" and it has been assigned to {assigned_to} on {date_received}.

We will be in touch shortly.

Kind regards,
SEB Claims Team`;

export function Step7Templates({ mailboxId, onNext, onBack }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [cats, rules] = await Promise.all([
        fetch(`/api/mailbox/categories?mailboxId=${mailboxId}`).then(r => r.json() as Promise<Category[]>),
        fetch(`/api/mailbox/rules?mailboxId=${mailboxId}`).then(r => r.json() as Promise<Rule[]>),
      ]);
      setCategories(cats);

      const templateMap: Record<string, string> = {};
      for (const cat of cats) {
        const rule = rules.find(r => r.categoryId === cat.id);
        templateMap[cat.id] = rule?.acknowledgeTemplate ?? (rule?.autoAcknowledge ? DEFAULT_TEMPLATE : '');
      }
      setTemplates(templateMap);
    })();
  }, [mailboxId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const categories2 = await fetch(`/api/mailbox/categories?mailboxId=${mailboxId}`).then(r => r.json() as Promise<Category[]>);
      for (const cat of categories2) {
        await fetch('/api/mailbox/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mailboxId,
            categoryId: cat.id,
            categoryName: cat.name,
            acknowledgeTemplate: templates[cat.id] || null,
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
        <h2 className="text-lg font-semibold text-[#0D2761]">Step 7: Acknowledgement Templates</h2>
        <p className="text-sm text-[#6B7280] mt-1">Set auto-acknowledge email templates per category.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {VARIABLE_HINTS.map(v => (
            <span key={v} className="px-2 py-0.5 bg-[#EEF3FC] text-[#1E5BC6] text-xs rounded font-mono">{v}</span>
          ))}
          <span className="text-xs text-[#6B7280] self-center ml-1">— available variables</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-4">
        {categories.map(cat => (
          <div key={cat.id} className="border border-[#E8EEF8] rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.colour }} />
              <span className="text-sm font-semibold text-[#0D2761]">{cat.name}</span>
            </div>
            <textarea
              rows={6}
              value={templates[cat.id] ?? ''}
              onChange={e => setTemplates(prev => ({ ...prev, [cat.id]: e.target.value }))}
              placeholder="Leave blank to skip auto-acknowledgement for this category…"
              className="w-full border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] font-mono focus:outline-none focus:ring-2 focus:ring-[#1E5BC6] resize-none"
            />
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
