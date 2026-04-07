'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, AlertTriangle } from 'lucide-react';

interface MailboxConfig {
  id: string;
  departmentName: string;
  mailboxAddress: string;
  isConfigured: boolean;
  urgentKeywords: string[];
}

interface Category {
  id: string;
  name: string;
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  isTeamLeader: boolean;
}

interface Props {
  mailboxId: string;
  onNext: () => void;
  onBack: () => void;
}

export function Step9Activate({ mailboxId, onBack }: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<MailboxConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [configs, cats, stf] = await Promise.all([
        fetch('/api/mailbox/config').then(r => r.json() as Promise<MailboxConfig[]>),
        fetch(`/api/mailbox/categories?mailboxId=${mailboxId}`).then(r => r.json() as Promise<Category[]>),
        fetch(`/api/mailbox/staff?mailboxId=${mailboxId}`).then(r => r.json() as Promise<StaffMember[]>),
      ]);
      setConfig(configs.find(c => c.id === mailboxId) ?? null);
      setCategories(cats);
      setStaff(stf);
    })();
  }, [mailboxId]);

  async function handleActivate() {
    setActivating(true);
    setError(null);
    try {
      await fetch('/api/mailbox/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mailboxId, isConfigured: true }),
      });
      router.push('/mailbox');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate');
      setActivating(false);
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-[#0D2761]">Step 9: Activate</h2>
        <p className="text-sm text-[#6B7280] mt-1">Review your configuration and activate the mailbox triage system.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {config && (
        <div className="space-y-4">
          <div className="border border-[#E8EEF8] rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Mailbox</h3>
            <div className="text-sm text-[#0D2761]"><strong>{config.departmentName}</strong></div>
            <div className="text-sm text-[#6B7280]">{config.mailboxAddress}</div>
            <div className="text-xs text-[#6B7280]">{config.urgentKeywords.length} urgent keywords</div>
          </div>

          <div className="border border-[#E8EEF8] rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
              Categories ({categories.length})
            </h3>
            <ul className="space-y-1">
              {categories.map(cat => (
                <li key={cat.id} className="text-sm text-[#0D2761] flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" strokeWidth={2} />
                  {cat.name}
                </li>
              ))}
            </ul>
          </div>

          <div className="border border-[#E8EEF8] rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
              Staff ({staff.length})
            </h3>
            <ul className="space-y-1">
              {staff.map(s => (
                <li key={s.id} className="text-sm text-[#0D2761] flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" strokeWidth={2} />
                  {s.name}
                  {s.isTeamLeader && <span className="text-[10px] bg-[#EEF3FC] text-[#1E5BC6] px-1.5 py-0.5 rounded-full font-semibold">TL</span>}
                </li>
              ))}
            </ul>
          </div>

          {categories.length === 0 || staff.length === 0 ? (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-[#F5A800] flex-shrink-0" strokeWidth={2} />
              <span className="text-sm text-amber-800">
                Please complete all previous steps before activating.
              </span>
            </div>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-[#E8EEF8] text-[#6B7280] text-sm font-medium rounded-lg hover:bg-[#F4F6FA] transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => void handleActivate()}
          disabled={activating || categories.length === 0 || staff.length === 0}
          className="px-6 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {activating ? 'Activating…' : 'Activate Mailbox Triage'}
        </button>
      </div>
    </div>
  );
}
