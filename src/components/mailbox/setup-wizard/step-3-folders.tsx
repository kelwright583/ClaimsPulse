'use client';

import { useState, useEffect } from 'react';

interface Category {
  id: string;
  name: string;
  colour: string;
}

interface Rule {
  categoryId: string;
  categoryName: string;
  destinationFolderName: string;
}

interface Props {
  mailboxId: string;
  onNext: () => void;
  onBack: () => void;
}

export function Step3Folders({ mailboxId, onNext, onBack }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [folders, setFolders] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [cats, rules] = await Promise.all([
        fetch(`/api/mailbox/categories?mailboxId=${mailboxId}`).then(r => r.json() as Promise<Category[]>),
        fetch(`/api/mailbox/rules?mailboxId=${mailboxId}`).then(r => r.json() as Promise<Rule[]>),
      ]);
      setCategories(cats);
      const folderMap: Record<string, string> = {};
      for (const rule of rules) {
        folderMap[rule.categoryId] = rule.destinationFolderName ?? rule.categoryName;
      }
      setFolders(folderMap);
    })();
  }, [mailboxId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      for (const cat of categories) {
        await fetch('/api/mailbox/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mailboxId,
            categoryId: cat.id,
            categoryName: cat.name,
            destinationFolderName: folders[cat.id] ?? cat.name,
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
        <h2 className="text-lg font-semibold text-[#0D2761]">Step 3: Folder Mapping</h2>
        <p className="text-sm text-[#6B7280] mt-1">For each category, specify the mailbox folder emails will be moved to.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-3">
        {categories.map(cat => (
          <div key={cat.id} className="flex items-center gap-4">
            <div className="flex items-center gap-2 w-36 flex-shrink-0">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.colour }} />
              <span className="text-sm text-[#0D2761] font-medium truncate">{cat.name}</span>
            </div>
            <span className="text-[#6B7280] text-sm">→</span>
            <input
              type="text"
              value={folders[cat.id] ?? cat.name}
              onChange={e => setFolders(prev => ({ ...prev, [cat.id]: e.target.value }))}
              placeholder="Folder name"
              className="flex-1 border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
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
