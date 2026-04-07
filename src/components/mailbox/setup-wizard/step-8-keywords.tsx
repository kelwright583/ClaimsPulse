'use client';

import { useState, useEffect } from 'react';

interface Props {
  mailboxId: string;
  onNext: () => void;
  onBack: () => void;
}

const DEFAULT_KEYWORDS = ['urgent', 'attorney', 'legal action', 'summons', 'litigation', 'urgent query', 'big claim'];

export function Step8Keywords({ mailboxId, onNext, onBack }: Props) {
  const [keywordsText, setKeywordsText] = useState(DEFAULT_KEYWORDS.join('\n'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/mailbox/config')
      .then(r => r.json() as Promise<Array<{ id: string; urgentKeywords: string[] }>>)
      .then(configs => {
        const config = configs.find(c => c.id === mailboxId);
        if (config?.urgentKeywords?.length) {
          setKeywordsText(config.urgentKeywords.join('\n'));
        }
      })
      .catch(() => {});
  }, [mailboxId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const keywords = keywordsText
        .split('\n')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      await fetch('/api/mailbox/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mailboxId, urgentKeywords: keywords }),
      });
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
        <h2 className="text-lg font-semibold text-[#0D2761]">Step 8: Urgent Keywords</h2>
        <p className="text-sm text-[#6B7280] mt-1">
          Add keywords that trigger urgent classification, one per line.
          These supplement the AI classifier.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <textarea
        rows={12}
        value={keywordsText}
        onChange={e => setKeywordsText(e.target.value)}
        placeholder="urgent&#10;attorney&#10;legal action&#10;summons&#10;…"
        className="w-full border border-[#E8EEF8] rounded-xl px-4 py-3 text-sm text-[#0D2761] font-mono focus:outline-none focus:ring-2 focus:ring-[#1E5BC6] resize-none"
      />

      <p className="text-xs text-[#6B7280]">
        {keywordsText.split('\n').filter(k => k.trim()).length} keywords configured
      </p>

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
