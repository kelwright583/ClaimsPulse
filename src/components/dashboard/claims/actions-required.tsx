'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Check, Download } from 'lucide-react';
import type { UserRole } from '@/types/roles';
import type { FilterState } from '@/components/dashboard/types';

interface ActionsRequiredData {
  writeOffs: Array<{
    claimId: string;
    policyNumber: string | null;
    insured: string | null;
    dateOfLoss: string | null;
    cause: string | null;
    effectiveCancellationDate: string;
    handler: string | null;
    uwNotified: boolean;
  }>;
  tpRecovery: Array<{
    claimId: string;
    insured: string | null;
    tpOs: number;
    daysSinceFinalisation: number | null;
    handler: string | null;
    instructed: boolean;
  }>;
  salvageReferrals: Array<{
    claimId: string;
    insured: string | null;
    expectedSalvage: number | null;
    daysSinceFinalisation: number | null;
    handler: string | null;
    referred: boolean;
  }>;
  repairerFollowUp: Array<{
    claimId: string;
    repairer: string | null;
    daysWaiting: number | null;
    handler: string | null;
    chased: boolean;
  }>;
}

interface SubViewProps {
  role: UserRole;
  userId: string;
  filters: FilterState;
}

type ActionType = 'uw_notified' | 'tp_instructed' | 'salvage_referred' | 'repairer_chased';

function formatZAR(value: number | null) {
  if (value === null) return '—';
  return 'R ' + value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function ClaimLink({ claimId }: { claimId: string }) {
  return (
    <Link href={`/claims/${encodeURIComponent(claimId)}`} className="font-mono text-[#1E5BC6] text-xs hover:underline">
      {claimId}
    </Link>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold ${
      count > 0 ? 'bg-[#FEE2E2] text-[#991B1B]' : 'bg-[#F4F6FA] text-[#6B7280]'
    }`}>
      {count}
    </span>
  );
}

interface CollapsibleSectionProps {
  title: string;
  count: number;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
}

function CollapsibleSection({ title, count, children, headerAction }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-xl border border-[#E8EEF8] shadow-sm overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => e.key === 'Enter' && setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F4F6FA] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#0D2761] text-sm">{title}</span>
          <CountBadge count={count} />
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {headerAction}
          <span className="text-[#6B7280]">
            {open ? <ChevronUp className="w-4 h-4" strokeWidth={2} /> : <ChevronDown className="w-4 h-4" strokeWidth={2} />}
          </span>
        </div>
      </div>
      {open && <div className="border-t border-[#E8EEF8]">{children}</div>}
    </div>
  );
}

interface ToggleButtonProps {
  claimId: string;
  actionType: ActionType;
  isComplete: boolean;
  onToggle: (claimId: string, actionType: ActionType) => void;
  pendingLabel: string;
}

function ToggleButton({ claimId, actionType, isComplete, onToggle, pendingLabel }: ToggleButtonProps) {
  if (isComplete) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[#059669] font-medium">
        <Check className="w-3.5 h-3.5" strokeWidth={2} />
        Notified
      </span>
    );
  }
  return (
    <button
      onClick={() => onToggle(claimId, actionType)}
      className="text-xs px-2.5 py-1 rounded-lg border border-[#E8EEF8] text-[#0D2761] hover:bg-[#F4F6FA] transition-colors font-medium"
    >
      {pendingLabel}
    </button>
  );
}

const EMPTY_SECTION = (label: string) =>
  `No pending ${label} — all up to date.`;

export function ActionsRequired({ userId: _userId, filters }: SubViewProps) {
  const [data, setData] = useState<ActionsRequiredData | null>(null);
  const [loading, setLoading] = useState(true);
  // Track optimistic overrides: claimId -> true
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    const keys = Object.keys(filters) as (keyof FilterState)[];
    for (const k of keys) {
      const v = filters[k] as string;
      if (v) params.set(k, v);
    }
    fetch(`/api/dashboard/claims/actions-required?${params}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then((json: ActionsRequiredData | null) => { if (json) setData(json); })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [filters]);

  const handleToggle = useCallback(async (claimId: string, actionType: ActionType) => {
    // Optimistic update
    setCompleted(prev => ({ ...prev, [`${claimId}||${actionType}`]: true }));
    try {
      await fetch('/api/claim-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, actionType, isComplete: true }),
      });
    } catch {
      // Rollback on error
      setCompleted(prev => {
        const next = { ...prev };
        delete next[`${claimId}||${actionType}`];
        return next;
      });
    }
  }, []);

  function isComplete(claimId: string, actionType: ActionType, serverValue: boolean) {
    return completed[`${claimId}||${actionType}`] ?? serverValue;
  }

  function handleDownloadReport() {
    window.location.href = '/api/reports/writeoff-uw-cancellation';
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />
        <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />
        <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />
        <div className="animate-pulse bg-[#E8EEF8] rounded-lg h-32 w-full" />
      </div>
    );
  }

  const writeOffs = data?.writeOffs ?? [];
  const tpRecovery = data?.tpRecovery ?? [];
  const salvageReferrals = data?.salvageReferrals ?? [];
  const repairerFollowUp = data?.repairerFollowUp ?? [];

  return (
    <div className="space-y-4">
      {/* Section A — Write-offs */}
      <CollapsibleSection
        title="Write-off → UW cancellation list"
        count={writeOffs.length}
        headerAction={
          <button
            onClick={handleDownloadReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#F5A800] text-[#92400E] rounded-lg hover:bg-[#FFF9EC] transition-colors"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={2} />
            Generate UW cancellation report
          </button>
        }
      >
        {writeOffs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[#6B7280]">{EMPTY_SECTION('write-offs')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F4F6FA]">
                  {['Claim ID', 'Policy number', 'Insured', 'Date of loss', 'Eff. cancellation date', 'Handler', 'UW notified'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {writeOffs.map(row => (
                  <tr key={row.claimId} className="border-t border-[#E8EEF8] hover:bg-[#F4F6FA] transition-colors">
                    <td className="px-4 py-3"><ClaimLink claimId={row.claimId} /></td>
                    <td className="px-4 py-3 text-sm text-[#0D2761]">{row.policyNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-[#0D2761]">{row.insured ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-[#6B7280]">{row.dateOfLoss ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-[#0D2761] font-medium">{row.effectiveCancellationDate}</td>
                    <td className="px-4 py-3 text-sm text-[#0D2761]">{row.handler ?? '—'}</td>
                    <td className="px-4 py-3">
                      <ToggleButton
                        claimId={row.claimId}
                        actionType="uw_notified"
                        isComplete={isComplete(row.claimId, 'uw_notified', row.uwNotified)}
                        onToggle={handleToggle}
                        pendingLabel="Mark notified"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Section B — TP recovery */}
      <CollapsibleSection title="Third party recovery" count={tpRecovery.length}>
        {tpRecovery.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[#6B7280]">{EMPTY_SECTION('TP recovery')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F4F6FA]">
                  {['Claim ID', 'Insured', 'TP outstanding', 'Days since finalisation', 'Handler', 'Instructed'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tpRecovery.map(row => (
                  <tr key={row.claimId} className="border-t border-[#E8EEF8] hover:bg-[#F4F6FA] transition-colors">
                    <td className="px-4 py-3"><ClaimLink claimId={row.claimId} /></td>
                    <td className="px-4 py-3 text-sm text-[#0D2761]">{row.insured ?? '—'}</td>
                    <td className="px-4 py-3 text-sm tabular-nums font-medium text-[#0D2761]">{formatZAR(row.tpOs)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-[#6B7280]">{row.daysSinceFinalisation ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-[#0D2761]">{row.handler ?? '—'}</td>
                    <td className="px-4 py-3">
                      <ToggleButton
                        claimId={row.claimId}
                        actionType="tp_instructed"
                        isComplete={isComplete(row.claimId, 'tp_instructed', row.instructed)}
                        onToggle={handleToggle}
                        pendingLabel="Mark instructed"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Section C — Salvage referrals */}
      <CollapsibleSection title="Salvage referrals" count={salvageReferrals.length}>
        {salvageReferrals.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[#6B7280]">{EMPTY_SECTION('salvage referrals')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F4F6FA]">
                  {['Claim ID', 'Insured', 'Expected salvage', 'Days since finalisation', 'Handler', 'Referred'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {salvageReferrals.map(row => (
                  <tr key={row.claimId} className="border-t border-[#E8EEF8] hover:bg-[#F4F6FA] transition-colors">
                    <td className="px-4 py-3"><ClaimLink claimId={row.claimId} /></td>
                    <td className="px-4 py-3 text-sm text-[#0D2761]">{row.insured ?? '—'}</td>
                    <td className="px-4 py-3 text-sm tabular-nums font-medium text-[#0D2761]">{formatZAR(row.expectedSalvage)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-[#6B7280]">{row.daysSinceFinalisation ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-[#0D2761]">{row.handler ?? '—'}</td>
                    <td className="px-4 py-3">
                      <ToggleButton
                        claimId={row.claimId}
                        actionType="salvage_referred"
                        isComplete={isComplete(row.claimId, 'salvage_referred', row.referred)}
                        onToggle={handleToggle}
                        pendingLabel="Mark referred"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Section D — Repairer invoice follow-up */}
      <CollapsibleSection title="Repairer invoice follow-up" count={repairerFollowUp.length}>
        {repairerFollowUp.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[#6B7280]">{EMPTY_SECTION('repairer follow-ups')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F4F6FA]">
                  {['Claim ID', 'Repairer', 'Days waiting', 'Handler', 'Chased'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#F5A800] uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {repairerFollowUp.map(row => (
                  <tr key={row.claimId} className="border-t border-[#E8EEF8] hover:bg-[#F4F6FA] transition-colors">
                    <td className="px-4 py-3"><ClaimLink claimId={row.claimId} /></td>
                    <td className="px-4 py-3 text-sm text-[#0D2761]">{row.repairer ?? '—'}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-[#6B7280]">{row.daysWaiting ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-[#0D2761]">{row.handler ?? '—'}</td>
                    <td className="px-4 py-3">
                      <ToggleButton
                        claimId={row.claimId}
                        actionType="repairer_chased"
                        isComplete={isComplete(row.claimId, 'repairer_chased', row.chased)}
                        onToggle={handleToggle}
                        pendingLabel="Mark chased"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
