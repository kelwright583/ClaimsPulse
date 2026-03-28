'use client';

import { useState } from 'react';
import { ACKNOWLEDGED_DELAY_REASONS } from '@/types/claims';

interface AcknowledgedDelayModalProps {
  claimId: string;
  secondaryStatus: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AcknowledgedDelayModal({
  claimId,
  secondaryStatus,
  onClose,
  onSuccess,
}: AcknowledgedDelayModalProps) {
  const [reasonType, setReasonType] = useState('');
  const [note, setNote] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reasonType || !expectedDate) {
      setError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/acknowledged-delays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, secondaryStatus, reasonType, note, expectedDate }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to log delay');
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-lg w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EEF8]">
          <div>
            <h2 className="text-base font-semibold text-[#0D2761]">Log Acknowledged Delay</h2>
            <p className="text-xs text-[#6B7280] mt-0.5 font-mono">{claimId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[#6B7280] hover:text-[#0D2761] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Secondary status (read-only) */}
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">Current Secondary Status</label>
            <p className="text-sm text-[#0D2761] font-medium px-3 py-2 bg-[#F4F6FA] rounded-lg border border-[#E8EEF8]">
              {secondaryStatus || '—'}
            </p>
          </div>

          {/* Reason type */}
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">
              Reason <span className="text-[#991B1B]">*</span>
            </label>
            <select
              value={reasonType}
              onChange={e => setReasonType(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-[#E8EEF8] rounded-lg bg-white text-[#0D2761] focus:outline-none focus:border-[#0D2761] focus:ring-1 focus:ring-[#0D2761]/30"
            >
              <option value="">Select a reason...</option>
              {ACKNOWLEDGED_DELAY_REASONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">Additional Note</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="Optional context or details..."
              className="w-full px-3 py-2 text-sm border border-[#E8EEF8] rounded-lg bg-white text-[#0D2761] placeholder-[#6B7280] focus:outline-none focus:border-[#0D2761] focus:ring-1 focus:ring-[#0D2761]/30 resize-none"
            />
          </div>

          {/* Expected date */}
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">
              Expected Resolution Date <span className="text-[#991B1B]">*</span>
            </label>
            <input
              type="date"
              value={expectedDate}
              onChange={e => setExpectedDate(e.target.value)}
              required
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 text-sm border border-[#E8EEF8] rounded-lg bg-white text-[#0D2761] focus:outline-none focus:border-[#0D2761] focus:ring-1 focus:ring-[#0D2761]/30"
            />
          </div>

          {error && (
            <p className="text-xs text-[#991B1B] bg-[#991B1B]/5 border border-[#991B1B]/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E8EEF8] bg-[#F4F6FA] rounded-b-xl">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-[#6B7280] hover:text-[#0D2761] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 bg-[#0D2761] text-white text-sm font-medium rounded-lg hover:bg-[#1E5BC6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Logging...' : 'Log Delay'}
          </button>
        </div>
      </div>
    </div>
  );
}
