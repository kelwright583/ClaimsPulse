import { redirect, notFound } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { ClaimDetailCard } from '@/components/claims/claim-detail-card';
import { ClaimTimeline } from '@/components/claims/claim-timeline';
import { Badge, SlaBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDate, formatZAR } from '@/lib/utils';
import type { SlaPriority } from '@/types/claims';

interface PageProps {
  params: Promise<{ id: string }>;
}

function serializeSnapshot(s: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (v instanceof Date) {
      out[k] = v.toISOString().split('T')[0];
    } else if (v !== null && typeof v === 'object' && 'toFixed' in v) {
      out[k] = Number(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export default async function ClaimDetailPage({ params }: PageProps) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const { id } = await params;
  const claimId = decodeURIComponent(id);

  const [snapshots, acknowledgedDelays, tatConfigs] = await Promise.all([
    prisma.claimSnapshot.findMany({
      where: { claimId },
      orderBy: { snapshotDate: 'asc' },
    }),
    prisma.acknowledgedDelay.findMany({
      where: { claimId },
      orderBy: { loggedAt: 'desc' },
    }),
    prisma.tatConfig.findMany({ where: { isActive: true } }),
  ]);

  if (snapshots.length === 0) {
    notFound();
  }

  const latest = snapshots[snapshots.length - 1];
  const slaMap = new Map(tatConfigs.map(c => [c.secondaryStatus, c]));
  const sla = latest.secondaryStatus ? slaMap.get(latest.secondaryStatus) : null;

  const serializedLatest = serializeSnapshot(latest as unknown as Record<string, unknown>);
  const serializedSnapshots = snapshots.map(s => serializeSnapshot(s as unknown as Record<string, unknown>));

  const claimData = {
    claimId: latest.claimId,
    handler: latest.handler,
    claimStatus: latest.claimStatus,
    secondaryStatus: latest.secondaryStatus,
    isTatBreach: latest.isTatBreach,
    daysInCurrentStatus: latest.daysInCurrentStatus,
    slaPriority: (sla?.priority as SlaPriority) ?? null,
    policyNumber: latest.policyNumber,
    insured: latest.insured,
    broker: latest.broker,
    uwYear: latest.uwYear,
    dateOfLoss: latest.dateOfLoss ? latest.dateOfLoss.toISOString().split('T')[0] : null,
    dateOfNotification: latest.dateOfNotification ? latest.dateOfNotification.toISOString().split('T')[0] : null,
    dateOfRegistration: latest.dateOfRegistration ? latest.dateOfRegistration.toISOString().split('T')[0] : null,
    notificationGapDays: latest.notificationGapDays,
    cause: latest.cause,
    lossArea: latest.lossArea,
    lossAddr: latest.lossAddr,
    ownDamagePaid: latest.ownDamagePaid !== null ? Number(latest.ownDamagePaid) : null,
    thirdPartyPaid: latest.thirdPartyPaid !== null ? Number(latest.thirdPartyPaid) : null,
    expensesPaid: latest.expensesPaid !== null ? Number(latest.expensesPaid) : null,
    legalCostsPaid: latest.legalCostsPaid !== null ? Number(latest.legalCostsPaid) : null,
    assessorFeesPaid: latest.assessorFeesPaid !== null ? Number(latest.assessorFeesPaid) : null,
    repairAuthPaid: latest.repairAuthPaid !== null ? Number(latest.repairAuthPaid) : null,
    cashLieuPaid: latest.cashLieuPaid !== null ? Number(latest.cashLieuPaid) : null,
    glassAuthPaid: latest.glassAuthPaid !== null ? Number(latest.glassAuthPaid) : null,
    partsAuthPaid: latest.partsAuthPaid !== null ? Number(latest.partsAuthPaid) : null,
    towingPaid: latest.towingPaid !== null ? Number(latest.towingPaid) : null,
    additionalsPaid: latest.additionalsPaid !== null ? Number(latest.additionalsPaid) : null,
    tpLiabilityPaid: latest.tpLiabilityPaid !== null ? Number(latest.tpLiabilityPaid) : null,
    investigationPaid: latest.investigationPaid !== null ? Number(latest.investigationPaid) : null,
    totalPaid: latest.totalPaid !== null ? Number(latest.totalPaid) : null,
    totalRecovery: latest.totalRecovery !== null ? Number(latest.totalRecovery) : null,
    totalSalvage: latest.totalSalvage !== null ? Number(latest.totalSalvage) : null,
    ownDamageOs: latest.ownDamageOs !== null ? Number(latest.ownDamageOs) : null,
    thirdPartyOs: latest.thirdPartyOs !== null ? Number(latest.thirdPartyOs) : null,
    expensesOs: latest.expensesOs !== null ? Number(latest.expensesOs) : null,
    legalCostsOs: latest.legalCostsOs !== null ? Number(latest.legalCostsOs) : null,
    assessorFeesOs: latest.assessorFeesOs !== null ? Number(latest.assessorFeesOs) : null,
    repairAuthOs: latest.repairAuthOs !== null ? Number(latest.repairAuthOs) : null,
    cashLieuOs: latest.cashLieuOs !== null ? Number(latest.cashLieuOs) : null,
    glassAuthOs: latest.glassAuthOs !== null ? Number(latest.glassAuthOs) : null,
    tpLiabilityOs: latest.tpLiabilityOs !== null ? Number(latest.tpLiabilityOs) : null,
    totalOs: latest.totalOs !== null ? Number(latest.totalOs) : null,
    intimatedAmount: latest.intimatedAmount !== null ? Number(latest.intimatedAmount) : null,
    totalIncurred: latest.totalIncurred !== null ? Number(latest.totalIncurred) : null,
    reserveUtilisationPct: latest.reserveUtilisationPct !== null ? Number(latest.reserveUtilisationPct) : null,
    deltaFlags: (latest.deltaFlags && typeof latest.deltaFlags === 'object' && !Array.isArray(latest.deltaFlags))
      ? latest.deltaFlags as Record<string, boolean>
      : null,
  };

  const statusColor =
    latest.claimStatus === 'Finalised' ? 'bg-[#065F46]/10 text-[#065F46] border-[#065F46]/20' :
    latest.claimStatus === 'Repudiated' || latest.claimStatus === 'Cancelled' ? 'bg-[#991B1B]/10 text-[#991B1B] border-[#991B1B]/20' :
    'bg-[#0D2761]/10 text-[#0D2761] border-[#0D2761]/20';

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <a href="/claims" className="text-sm text-[#6B7280] hover:text-[#0D2761] transition-colors">
                ← Claims Register
              </a>
            </div>
            <h1 className="text-2xl font-semibold text-[#0D2761] font-mono">{claimId}</h1>
            <p className="text-sm text-[#6B7280] mt-1">
              {latest.insured} {latest.broker ? `· ${latest.broker}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {latest.claimStatus && (
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${statusColor}`}>
                {latest.claimStatus}
              </span>
            )}
            {sla?.priority && (
              <SlaBadge priority={sla.priority as SlaPriority} />
            )}
            {latest.isTatBreach && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-[#991B1B]/10 text-[#991B1B] border border-[#991B1B]/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#991B1B] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#991B1B]" />
                </span>
                SLA Breach
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Detail card */}
        <Card className="h-fit">
          <ClaimDetailCard claim={claimData} />
        </Card>

        {/* Right: Timeline + Financial summary + Acknowledged Delays */}
        <div className="space-y-6">
          {/* Status Timeline */}
          <Card>
            <h2 className="text-base font-semibold text-[#0D2761] mb-4">Status History</h2>
            <ClaimTimeline
              snapshots={serializedSnapshots.map(s => ({
                claimId: s.claimId as string,
                claimStatus: s.claimStatus as string | null,
                secondaryStatus: s.secondaryStatus as string | null,
                snapshotDate: s.snapshotDate as string,
                daysInCurrentStatus: s.daysInCurrentStatus as number | null,
              }))}
            />
            <p className="text-xs text-[#6B7280] mt-4">
              {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} from{' '}
              {formatDate(snapshots[0].snapshotDate.toISOString())} to{' '}
              {formatDate(latest.snapshotDate.toISOString())}
            </p>
          </Card>

          {/* Financial Summary */}
          <Card>
            <h2 className="text-base font-semibold text-[#0D2761] mb-4">Financial Summary</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-[#F4F6FA] p-4">
                <p className="text-xs text-[#6B7280] mb-1">Total Incurred</p>
                <p className="text-lg font-semibold text-[#0D2761] tabular-nums">
                  {formatZAR(claimData.totalIncurred)}
                </p>
              </div>
              <div className="rounded-lg bg-[#F4F6FA] p-4">
                <p className="text-xs text-[#6B7280] mb-1">Total Outstanding</p>
                <p className="text-lg font-semibold text-[#0D2761] tabular-nums">
                  {formatZAR(claimData.totalOs)}
                </p>
              </div>
              <div className="rounded-lg bg-[#F4F6FA] p-4">
                <p className="text-xs text-[#6B7280] mb-1">Total Paid</p>
                <p className="text-lg font-semibold text-[#0D2761] tabular-nums">
                  {formatZAR(claimData.totalPaid)}
                </p>
              </div>
              <div className="rounded-lg bg-[#F4F6FA] p-4">
                <p className="text-xs text-[#6B7280] mb-1">Reserve Utilisation</p>
                <p className={`text-lg font-semibold tabular-nums ${
                  claimData.reserveUtilisationPct != null && claimData.reserveUtilisationPct > 150
                    ? 'text-[#991B1B]'
                    : claimData.reserveUtilisationPct != null && claimData.reserveUtilisationPct > 80
                    ? 'text-[#92400E]'
                    : 'text-[#0D2761]'
                }`}>
                  {claimData.reserveUtilisationPct != null
                    ? `${Number(claimData.reserveUtilisationPct).toFixed(1)}%`
                    : '—'}
                </p>
              </div>
            </div>
          </Card>

          {/* Acknowledged Delays */}
          {acknowledgedDelays.length > 0 && (
            <Card>
              <h2 className="text-base font-semibold text-[#0D2761] mb-4">Acknowledged Delays</h2>
              <div className="space-y-3">
                {acknowledgedDelays.map(delay => (
                  <div
                    key={delay.id}
                    className={`rounded-lg border p-3 ${
                      delay.isActive
                        ? 'border-[#92400E]/20 bg-[#92400E]/5'
                        : 'border-[#E8EEF8] bg-[#F4F6FA] opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-[#0D2761]">{delay.reasonType}</p>
                        {delay.note && (
                          <p className="text-xs text-[#6B7280] mt-0.5">{delay.note}</p>
                        )}
                      </div>
                      <Badge variant={delay.isActive ? 'warning' : 'outline'}>
                        {delay.isActive ? 'Active' : 'Resolved'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[#6B7280]">
                      <span>Expected: {formatDate(delay.expectedDate.toISOString())}</span>
                      <span>Logged: {formatDate(delay.loggedAt.toISOString())}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
