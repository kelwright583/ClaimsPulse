'use client';

import { useState, useEffect } from 'react';
import { Trash2, Plus } from 'lucide-react';

interface Category {
  id?: string;
  name: string;
  description: string;
  colour: string;
}

interface Props {
  mailboxId: string;
  onNext: () => void;
  onBack: () => void;
}

const DEFAULT_COLOURS = ['#1E5BC6', '#10B981', '#F5A800', '#EF4444', '#8B5CF6', '#6B7280', '#EC4899', '#0891B2'];

export function Step2Categories({ mailboxId, onNext, onBack }: Props) {
  const [categories, setCategories] = useState<Category[]>([
    { name: 'Third Party', description: 'Third party and attorney correspondence', colour: '#EF4444' },
    { name: 'Salvage', description: 'Salvage queries and auction notifications', colour: '#F5A800' },
    { name: 'New Claim', description: 'New claim registrations from brokers or insureds', colour: '#1E5BC6' },
    { name: 'General Query', description: 'General questions and status updates', colour: '#6B7280' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load existing categories
    void fetch(`/api/mailbox/categories?mailboxId=${mailboxId}`)
      .then(r => r.json() as Promise<Category[]>)
      .then(data => { if (data.length > 0) setCategories(data); })
      .catch(() => {});
  }, [mailboxId]);

  function addCategory() {
    setCategories(prev => [...prev, { name: '', description: '', colour: '#6B7280' }]);
  }

  function removeCategory(index: number) {
    setCategories(prev => prev.filter((_, i) => i !== index));
  }

  function updateCategory(index: number, field: keyof Category, value: string) {
    setCategories(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  }

  async function handleSave() {
    const valid = categories.filter(c => c.name.trim());
    if (valid.length === 0) {
      setError('Add at least one category.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Delete existing and recreate (simple approach)
      const existing = await fetch(`/api/mailbox/categories?mailboxId=${mailboxId}`).then(r => r.json() as Promise<{ id: string }[]>);
      for (const cat of existing) {
        await fetch(`/api/mailbox/categories?id=${cat.id}`, { method: 'DELETE' });
      }

      for (let i = 0; i < valid.length; i++) {
        await fetch('/api/mailbox/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...valid[i], mailboxId, displayOrder: i }),
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
        <h2 className="text-lg font-semibold text-[#0D2761]">Step 2: Categories</h2>
        <p className="text-sm text-[#6B7280] mt-1">Define the routing categories for incoming emails.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-3">
        {categories.map((cat, i) => (
          <div key={i} className="flex items-start gap-3 p-3 border border-[#E8EEF8] rounded-lg">
            <input
              type="color"
              value={cat.colour}
              onChange={e => updateCategory(i, 'colour', e.target.value)}
              className="w-9 h-9 rounded border border-[#E8EEF8] cursor-pointer flex-shrink-0"
            />
            <div className="flex-1 grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Category name *"
                value={cat.name}
                onChange={e => updateCategory(i, 'name', e.target.value)}
                className="border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={cat.description}
                onChange={e => updateCategory(i, 'description', e.target.value)}
                className="border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
              />
            </div>
            <button
              onClick={() => removeCategory(i)}
              className="text-[#6B7280] hover:text-red-600 transition-colors flex-shrink-0 mt-1"
            >
              <Trash2 className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addCategory}
        className="flex items-center gap-2 text-sm text-[#1E5BC6] font-medium hover:text-[#0D2761] transition-colors"
      >
        <Plus className="w-4 h-4" strokeWidth={2} />
        Add category
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
