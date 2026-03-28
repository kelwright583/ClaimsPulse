import { formatZAR, formatDate } from '@/lib/utils';
import { Badge, SlaBadge } from '@/components/ui/badge';
import type { SlaPriority } from '@/types/claims';

interface ClaimDetailData {
  claimId: string;
  handler: string | null;
  claimStatus: string | null;
  secondaryStatus: string | null;
  isSlaBreach: boolean;
  daysInCurrentStatus: number | null;
  slaPriority?: SlaPriority | null;

  // Policy & insured
  policyNumber: string | null;
  insured: string | null;
  broker: string | null;
  uwYear: number | null;

  // Dates
  dateOfLoss: string | null;
  dateOfNotification: string | null;
  dateOfRegistration: string | null;
  notificationGapDays: number | null;

  // Cause & location
  cause: string | null;
  lossArea: string | null;
  lossAddr: string | null;

  // Paid breakdown
  ownDamagePaid: number | null;
  thirdPartyPaid: number | null;
  expensesPaid: number | null;
  legalCostsPaid: number | null;
  assessorFeesPaid: number | null;
  repairAuthPaid: number | null;
  cashLieuPaid: number | null;
  glassAuthPaid: number | null;
  partsAuthPaid: number | null;
  towingPaid: number | null;
  additionalsPaid: number | null;
  tpLiabilityPaid: number | null;
  investigationPaid: number | null;
  totalPaid: number | null;
  totalRecovery: number | null;
  totalSalvage: number | null;

  // Outstanding breakdown
  ownDamageOs: number | null;
  thirdPartyOs: number | null;
  expensesOs: number | null;
  legalCostsOs: number | null;
  assessorFeesOs: number | null;
  repairAuthOs: number | null;
  cashLieuOs: number | null;
  glassAuthOs: number | null;
  tpLiabilityOs: number | null;
  totalOs: number | null;

  // Totals
  intimatedAmount: number | null;
  totalIncurred: number | null;
  reserveUtilisationPct: number | null;

  // Flags
  deltaFlags: string[] | null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-3 pb-2 border-b border-[#E8EEF8]">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 mb-3">
      <span className="text-xs text-[#6B7280]">{label}</span>
      <span className="text-sm text-[#0D2761] font-medium">{value ?? '—'}</span>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number | null }) {
  if (!value && value !== 0) return null;
  return (
    <tr className="border-b border-[#E8EEF8] last:border-0">
      <td className="py-1.5 text-xs text-[#6B7280]">{label}</td>
      <td className="py-1.5 text-xs text-right font-medium tabular-nums text-[#0D2761]">{formatZAR(value)}</td>
    </tr>
  );
}

const DELTA_FLAG_LABELS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
  new_claim: { label: 'New Claim', variant: 'info' },
  status_change: { label: 'Status Changed', variant: 'warning' },
  secondary_status_change: { label: 'Sub-Status Changed', variant: 'warning' },
  reopened: { label: 'Reopened', variant: 'danger' },
  value_jump: { label: 'Value Jump', variant: 'danger' },
  finalised: { label: 'Finalised', variant: 'success' },
};

export function ClaimDetailCard({ claim }: { claim: ClaimDetailData }) {
  const statusColor =
    claim.claimStatus === 'Finalised' ? 'text-[#065F46]' :
    claim.claimStatus === 'Repudiated' || claim.claimStatus === 'Cancelled' ? 'text-[#991B1B]' :
    'text-[#0D2761]';

  return (
    <div className="space-y-0">
      {/* Policy & Insured */}
      <Section title="Policy & Insured">
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Policy Number" value={claim.policyNumber} />
          <Field label="Insured" value={claim.insured} />
          <Field label="Broker" value={claim.broker} />
          <Field label="UW Year" value={claim.uwYear} />
        </div>
      </Section>

      {/* Dates */}
      <Section title="Dates">
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Date of Loss" value={formatDate(claim.dateOfLoss)} />
          <Field label="Date of Notification" value={formatDate(claim.dateOfNotification)} />
          <Field label="Date of Registration" value={formatDate(claim.dateOfRegistration)} />
          <Field
            label="Notification Gap"
            value={
              claim.notificationGapDays != null
                ? `${claim.notificationGapDays} days`
                : null
            }
          />
        </div>
      </Section>

      {/* Cause & Location */}
      <Section title="Cause & Location">
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Cause" value={claim.cause} />
          <Field label="Loss Area" value={claim.lossArea} />
        </div>
        {claim.lossAddr && (
          <Field label="Loss Address" value={claim.lossAddr} />
        )}
      </Section>

      {/* Handler & Status */}
      <Section title="Handler & Status">
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Handler" value={claim.handler} />
          <Field
            label="Claim Status"
            value={<span className={`font-semibold ${statusColor}`}>{claim.claimStatus ?? '—'}</span>}
          />
          <Field label="Secondary Status" value={
            <div className="flex items-center gap-2">
              <span>{claim.secondaryStatus ?? '—'}</span>
              {claim.slaPriority && <SlaBadge priority={claim.slaPriority} />}
            </div>
          } />
          <Field
            label="Days in Status"
            value={claim.daysInCurrentStatus != null ? `${claim.daysInCurrentStatus} days` : null}
          />
        </div>
        {claim.isSlaBreach && (
          <div className="mt-2 flex items-center gap-2 text-xs font-medium text-[#991B1B]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#991B1B] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#991B1B]" />
            </span>
            SLA Breach — this claim has exceeded its SLA threshold
          </div>
        )}
      </Section>

      {/* Financials — Paid */}
      <Section title="Payments Breakdown">
        <table className="w-full">
          <tbody>
            <BreakdownRow label="Own Damage" value={claim.ownDamagePaid} />
            <BreakdownRow label="Third Party" value={claim.thirdPartyPaid} />
            <BreakdownRow label="Expenses" value={claim.expensesPaid} />
            <BreakdownRow label="Legal Costs" value={claim.legalCostsPaid} />
            <BreakdownRow label="Assessor Fees" value={claim.assessorFeesPaid} />
            <BreakdownRow label="Repair Auth" value={claim.repairAuthPaid} />
            <BreakdownRow label="Cash in Lieu" value={claim.cashLieuPaid} />
            <BreakdownRow label="Glass Auth" value={claim.glassAuthPaid} />
            <BreakdownRow label="Parts Auth" value={claim.partsAuthPaid} />
            <BreakdownRow label="Towing" value={claim.towingPaid} />
            <BreakdownRow label="Additionals" value={claim.additionalsPaid} />
            <BreakdownRow label="TP Liability" value={claim.tpLiabilityPaid} />
            <BreakdownRow label="Investigation" value={claim.investigationPaid} />
            <BreakdownRow label="Recovery" value={claim.totalRecovery} />
            <BreakdownRow label="Salvage" value={claim.totalSalvage} />
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#E8EEF8]">
              <td className="pt-2 text-xs font-bold text-[#0D2761]">Total Paid</td>
              <td className="pt-2 text-xs font-bold text-right tabular-nums text-[#0D2761]">
                {formatZAR(claim.totalPaid)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Section>

      {/* Financials — Outstanding */}
      <Section title="Outstanding Breakdown">
        <table className="w-full">
          <tbody>
            <BreakdownRow label="Own Damage" value={claim.ownDamageOs} />
            <BreakdownRow label="Third Party" value={claim.thirdPartyOs} />
            <BreakdownRow label="Expenses" value={claim.expensesOs} />
            <BreakdownRow label="Legal Costs" value={claim.legalCostsOs} />
            <BreakdownRow label="Assessor Fees" value={claim.assessorFeesOs} />
            <BreakdownRow label="Repair Auth" value={claim.repairAuthOs} />
            <BreakdownRow label="Cash in Lieu" value={claim.cashLieuOs} />
            <BreakdownRow label="Glass Auth" value={claim.glassAuthOs} />
            <BreakdownRow label="TP Liability" value={claim.tpLiabilityOs} />
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#E8EEF8]">
              <td className="pt-2 text-xs font-bold text-[#0D2761]">Total Outstanding</td>
              <td className="pt-2 text-xs font-bold text-right tabular-nums text-[#0D2761]">
                {formatZAR(claim.totalOs)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Section>

      {/* Reserve */}
      <Section title="Reserve">
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Intimated Amount" value={formatZAR(claim.intimatedAmount)} />
          <Field label="Total Incurred" value={formatZAR(claim.totalIncurred)} />
          <Field
            label="Reserve Utilisation"
            value={
              claim.reserveUtilisationPct != null ? (
                <span className={
                  claim.reserveUtilisationPct > 150 ? 'text-[#991B1B] font-bold' :
                  claim.reserveUtilisationPct > 80 ? 'text-[#92400E] font-semibold' :
                  ''
                }>
                  {Number(claim.reserveUtilisationPct).toFixed(1)}%
                </span>
              ) : null
            }
          />
        </div>
      </Section>

      {/* Delta flags */}
      {claim.deltaFlags && claim.deltaFlags.length > 0 && (
        <Section title="Change Flags">
          <div className="flex flex-wrap gap-2">
            {claim.deltaFlags.map(flag => {
              const meta = DELTA_FLAG_LABELS[flag];
              return (
                <Badge key={flag} variant={meta?.variant ?? 'default'}>
                  {meta?.label ?? flag}
                </Badge>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
