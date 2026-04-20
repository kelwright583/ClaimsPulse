'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { DrillDownClaim } from './types';

function fmtR(v: number | null | undefined) {
  if (v == null) return '—';
  return `R ${Math.round(v).toLocaleString('en-ZA')}`;
}

function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  return v.split('T')[0];
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b border-[#F4F6FA] last:border-0">
      <span className="text-xs text-[#6B7280] flex-shrink-0">{label}</span>
      <span className="text-xs text-[#0D2761] font-medium text-right">{value}</span>
    </div>
  );
}

interface ClaimDetail extends DrillDownClaim {
  ownDamagePaid?: number | null;
  thirdPartyPaid?: number | null;
  expensesPaid?: number | null;
  legalCostsPaid?: number | null;
  assessorFeesPaid?: number | null;
  towingPaid?: number | null;
  ownDamageOs?: number | null;
  thirdPartyOs?: number | null;
  expensesOs?: number | null;
  legalCostsOs?: number | null;
  assessorFeesOs?: number | null;
  dateOfNotification?: string | null;
  dateOfRegistration?: string | null;
  snapshotHistory?: { snapshotDate: string; claimStatus: string | null; secondaryStatus: string | null }[];
}

interface Props {
  claim: DrillDownClaim;
  onClose: () => void;
}

export function ClaimSidePanel({ claim, onClose }: Props) {
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    fetch(`/api/dashboard/drill-down/claim-detail?id=${encodeURIComponent(claim.claimId)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: ClaimDetail | null) => { if (d) setDetail(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [claim.claimId]);

  const d = detail ?? claim;

  const statusBadgeClass = (status: string | null) => {
    switch (status) {
      case 'Finalised': return 'bg-[#D1FAE5] text-[#065F46]';
      case 'Cancelled': return 'bg-[#F3F4F6] text-[#374151]';
      case 'Repudiated': return 'bg-[#FEE2E2] text-[#991B1B]';
      default: return 'bg-[#DBEAFE] text-[#1E40AF]';
    }
  };

  return (
    <div
      className="fixed top-0 right-0 h-full w-[480px] bg-white border-l border-[#E8EEF8] shadow-xl z-[60] flex flex-col"
      style={{ animation: 'slideInRight 300ms ease-out' }}
    >
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8EEF8]">
        <div className="flex items-center gap-3">
          <span className="font-bold text-[#0D2761] font-mono">{claim.claimId}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadgeClass(d.claimStatus)}`}>
            {d.claimStatus ?? '—'}
          </span>
          {d.isTatBreach && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#991B1B]">
              TAT breach
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F4F6FA] text-[#6B7280]">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-[#E8EEF8] rounded h-4 w-full" />
            ))}
          </div>
        )}

        {/* Parties */}
        <section>
          <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Parties</h3>
          <Row label="Handler" value={d.handler ?? '—'} />
          <Row label="Insured" value={d.insured ?? '—'} />
          <Row label="Broker" value={d.broker ?? '—'} />
        </section>

        {/* Secondary status */}
        {d.secondaryStatus && (
          <section>
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Status detail</h3>
            <Row label="Secondary status" value={d.secondaryStatus} />
            <Row label="Cause" value={d.cause ?? '—'} />
            <Row label="Loss area" value={d.lossArea ?? '—'} />
            <Row label="Days in status" value={d.daysInCurrentStatus != null ? `${d.daysInCurrentStatus} days` : '—'} />
            <Row label="Days open" value={d.daysOpen != null ? `${d.daysOpen} days` : '—'} />
          </section>
        )}

        {/* Key dates */}
        <section>
          <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Key dates</h3>
          <Row label="Date of loss" value={fmtDate(d.dateOfLoss)} />
          <Row label="Date of notification" value={fmtDate((d as ClaimDetail).dateOfNotification)} />
          <Row label="Date of registration" value={fmtDate((d as ClaimDetail).dateOfRegistration)} />
        </section>

        {/* Financial summary */}
        <section>
          <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Financial summary</h3>
          <Row label="Intimated amount" value={fmtR(d.intimatedAmount)} />
          <Row label="Total paid" value={fmtR(d.totalPaid)} />
          <Row label="Total outstanding" value={fmtR(d.totalOutstanding)} />
          <Row label="Total incurred" value={fmtR(d.totalIncurred)} />
          {d.totalRecovery != null && <Row label="Total recovery" value={fmtR(d.totalRecovery)} />}
          {d.totalSalvage != null && <Row label="Total salvage" value={fmtR(d.totalSalvage)} />}
        </section>

        {/* Paid breakdown */}
        {detail && (
          <>
            {[
              { label: 'Own damage', value: detail.ownDamagePaid },
              { label: 'Third party', value: detail.thirdPartyPaid },
              { label: 'Expenses', value: detail.expensesPaid },
              { label: 'Legal costs', value: detail.legalCostsPaid },
              { label: 'Assessor fees', value: detail.assessorFeesPaid },
              { label: 'Towing', value: detail.towingPaid },
            ].some(x => x.value != null) && (
              <section>
                <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Paid breakdown</h3>
                {detail.ownDamagePaid != null && <Row label="Own damage" value={fmtR(detail.ownDamagePaid)} />}
                {detail.thirdPartyPaid != null && <Row label="Third party" value={fmtR(detail.thirdPartyPaid)} />}
                {detail.expensesPaid != null && <Row label="Expenses" value={fmtR(detail.expensesPaid)} />}
                {detail.legalCostsPaid != null && <Row label="Legal costs" value={fmtR(detail.legalCostsPaid)} />}
                {detail.assessorFeesPaid != null && <Row label="Assessor fees" value={fmtR(detail.assessorFeesPaid)} />}
                {detail.towingPaid != null && <Row label="Towing" value={fmtR(detail.towingPaid)} />}
              </section>
            )}

            {/* Outstanding breakdown */}
            {[detail.ownDamageOs, detail.thirdPartyOs, detail.expensesOs, detail.legalCostsOs, detail.assessorFeesOs].some(v => v != null) && (
              <section>
                <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Outstanding breakdown</h3>
                {detail.ownDamageOs != null && <Row label="Own damage" value={fmtR(detail.ownDamageOs)} />}
                {detail.thirdPartyOs != null && <Row label="Third party" value={fmtR(detail.thirdPartyOs)} />}
                {detail.expensesOs != null && <Row label="Expenses" value={fmtR(detail.expensesOs)} />}
                {detail.legalCostsOs != null && <Row label="Legal costs" value={fmtR(detail.legalCostsOs)} />}
                {detail.assessorFeesOs != null && <Row label="Assessor fees" value={fmtR(detail.assessorFeesOs)} />}
              </section>
            )}

            {/* Timeline */}
            {detail.snapshotHistory && detail.snapshotHistory.length > 1 && (
              <section>
                <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Status timeline</h3>
                <div className="space-y-1">
                  {detail.snapshotHistory.map((h, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="flex flex-col items-center pt-1">
                        <div className="w-2 h-2 rounded-full bg-[#1E5BC6] flex-shrink-0" />
                        {i < detail.snapshotHistory!.length - 1 && (
                          <div className="w-px flex-1 bg-[#E8EEF8] min-h-[16px]" />
                        )}
                      </div>
                      <div className="pb-2">
                        <span className="text-xs font-medium text-[#0D2761]">{h.snapshotDate.split('T')[0]}</span>
                        <span className="text-xs text-[#6B7280] ml-2">{h.claimStatus ?? '—'}</span>
                        {h.secondaryStatus && (
                          <span className="text-xs text-[#9CA3AF] ml-1">/ {h.secondaryStatus}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
