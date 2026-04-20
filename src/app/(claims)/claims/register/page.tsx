import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { ClaimsTable } from '@/components/claims/claims-table';
import { formatDate } from '@/lib/utils';
import type { SlaPriority } from '@/types/claims';

interface ClaimRow {
  id: string;
  claimId: string;
  handler: string | null;
  insured: string | null;
  cause: string | null;
  claimStatus: string | null;
  secondaryStatus: string | null;
  isTatBreach: boolean;
  daysInCurrentStatus: number | null;
  totalIncurred: number | null;
  totalOs: number | null;
  snapshotDate: string;
  slaPriority: SlaPriority | null;
  slaMaxDays: number | null;
}

const PAGE_SIZE = 50;

async function getInitialData(role: string, fullName: string | null | undefined) {
  try {
    const latest = await prisma.$queryRaw<{ max: Date | null }[]>`
      SELECT MAX(snapshot_date) as max FROM claim_snapshots
    `;
    const maxDate = latest[0]?.max;
    if (!maxDate) return { data: [], total: 0, snapshotDate: null };

    const snapshotDate = maxDate instanceof Date ? maxDate : new Date(String(maxDate));

    const where: Record<string, unknown> = { snapshotDate };
    if (role === 'CLAIMS_TECHNICIAN' && fullName) {
      where.handler = fullName;
    }

    const [total, snapshots] = await Promise.all([
      prisma.claimSnapshot.count({ where }),
      prisma.claimSnapshot.findMany({
        where,
        orderBy: { claimId: 'asc' },
        take: PAGE_SIZE,
      }),
    ]);

    const tatConfigs = await prisma.tatConfig.findMany({ where: { isActive: true } });
    const slaMap = new Map(tatConfigs.map(c => [c.secondaryStatus, c]));

    const data: ClaimRow[] = snapshots.map(s => {
      const sla = s.secondaryStatus ? slaMap.get(s.secondaryStatus) : null;
      return {
        id: s.id,
        claimId: s.claimId,
        handler: s.handler,
        insured: s.insured,
        cause: s.cause,
        claimStatus: s.claimStatus,
        secondaryStatus: s.secondaryStatus,
        isTatBreach: s.isTatBreach,
        daysInCurrentStatus: s.daysInCurrentStatus,
        totalIncurred: s.totalIncurred !== null ? Number(s.totalIncurred) : null,
        totalOs: s.totalOs !== null ? Number(s.totalOs) : null,
        snapshotDate: snapshotDate.toISOString().split('T')[0],
        slaPriority: (sla?.priority as SlaPriority) ?? null,
        slaMaxDays: sla?.maxDays ?? null,
      };
    });

    return { data, total, snapshotDate: snapshotDate.toISOString().split('T')[0] };
  } catch {
    return { data: [], total: 0, snapshotDate: null };
  }
}

export default async function ClaimsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const { data, total, snapshotDate } = await getInitialData(ctx.role, ctx.fullName);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">Claims Register</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          {snapshotDate
            ? `Snapshot: ${formatDate(snapshotDate)} · ${total.toLocaleString()} claims`
            : 'No data imported yet.'}
        </p>
      </div>

      {snapshotDate ? (
        <ClaimsTable
          initialData={data}
          initialTotal={total}
          initialPage={1}
          pageSize={PAGE_SIZE}
          snapshotDate={snapshotDate}
          showHandlerFilter={ctx.role !== 'CLAIMS_TECHNICIAN'}
        />
      ) : (
        <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <p className="text-sm text-[#6B7280]">
            No claims data found. Upload a Claims Outstanding report from the{' '}
            <a href="/imports" className="text-[#0D2761] underline">Imports</a> page.
          </p>
        </div>
      )}
    </div>
  );
}
