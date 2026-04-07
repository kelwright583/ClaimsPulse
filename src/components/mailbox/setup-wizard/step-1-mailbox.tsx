'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  mailboxId: string | null;
  onMailboxCreated: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step1Mailbox({ mailboxId, onMailboxCreated, onNext }: Props) {
  const [departmentName, setDepartmentName] = useState('SEB Claims');
  const [mailboxAddress, setMailboxAddress] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stubMode, setStubMode] = useState(false);

  async function handleTestConnection() {
    // Check if in stub mode via dashboard endpoint
    try {
      const resp = await fetch('/api/mailbox/dashboard');
      const json = await resp.json() as { isStubMode: boolean };
      setStubMode(json.isStubMode);
    } catch {
      setStubMode(true);
    }
  }

  async function handleSave() {
    if (!departmentName || !mailboxAddress) {
      setError('Department name and mailbox address are required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const method = mailboxId ? 'PATCH' : 'POST';
      const body = mailboxId
        ? { id: mailboxId, departmentName, mailboxAddress, classificationInstructions: instructions }
        : { departmentName, mailboxAddress, classificationInstructions: instructions };

      const resp = await fetch('/api/mailbox/config', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) throw new Error(`Failed to save: ${resp.status}`);
      const json = await resp.json() as { id: string };
      onMailboxCreated(json.id);
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
        <h2 className="text-lg font-semibold text-[#0D2761]">Step 1: Mailbox Configuration</h2>
        <p className="text-sm text-[#6B7280] mt-1">Configure the basic mailbox settings and connection details.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {stubMode && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-[#F5A800] flex-shrink-0" strokeWidth={2} />
          <span className="text-sm text-amber-800">
            <strong>Stub mode:</strong> AZURE_CLIENT_ID not configured. Emails will use simulated data.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-[#0D2761]">Department name *</label>
        <input
          type="text"
          value={departmentName}
          onChange={e => setDepartmentName(e.target.value)}
          placeholder="e.g. SEB Claims"
          className="border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-[#0D2761]">Mailbox address *</label>
        <input
          type="email"
          value={mailboxAddress}
          onChange={e => setMailboxAddress(e.target.value)}
          placeholder="claims@yourcompany.co.za"
          className="border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-[#0D2761]">Classification instructions</label>
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          rows={4}
          placeholder="Additional context for the AI classifier — e.g. 'This is a short-term insurance claims mailbox for SEB. Emails from attorneys are often urgent.'"
          className="border border-[#E8EEF8] rounded-lg px-3 py-2 text-sm text-[#0D2761] focus:outline-none focus:ring-2 focus:ring-[#1E5BC6] resize-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleTestConnection()}
          type="button"
          className="px-4 py-2 border border-[#1E5BC6] text-[#1E5BC6] text-sm font-medium rounded-lg hover:bg-[#EEF3FC] transition-colors"
        >
          Test Connection
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
