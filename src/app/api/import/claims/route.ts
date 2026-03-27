export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { parseClaimsReport } from '@/lib/parsers/claims-parser';
import { computeDelta } from '@/lib/compute/delta';
import { computeSlaBreaches } from '@/lib/compute/sla';
import { computeFlags } from '@/lib/compute/fraud-signals';
import { COMPLEXITY_WEIGHTS, DEFAULT_WEIGHT } from '@/lib/compute/productivity';

export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!['HEAD_OF_CLAIMS', 'TEAM_LEADER'].includes(ctx.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();

  let parseResult: Awaited<ReturnType<typeof parseClaimsReport>>;
  try {
    parseResult = parseClaimsReport(buffer);
  } catch (err) {
    return Response.json({ error: 'Failed to parse file', detail: String(err) }, { status: 422 });
  }

  const { rows, snapshotDate } = parseResult;

  // Create ImportRun record
  const importRun = await prisma.importRun.create({
    data: {
      reportType: 'CLAIMS_OUTSTANDING',
      filename: file.name,
      uploadedBy: ctx.userId,
      rowsRead: rows.length,
    },
  });

  // Fetch previous snapshots (latest per claimId before snapshotDate)
  const previousSnapshots = await prisma.claimSnapshot.findMany({
    where: { snapshotDate: { lt: snapshotDate } },
    orderBy: { snapshotDate: 'desc' },
    distinct: ['claimId'],
    select: {
      claimId: true,
      claimStatus: true,
      secondaryStatus: true,
      totalIncurred: true,
      totalOs: true,
    },
  });
  const prevMap = new Map(previousSnapshots.map(s => [s.claimId, s]));

  // Load SLA configs
  const slaConfigs = await prisma.slaConfig.findMany({ where: { isActive: true } });

  // Compute daysInCurrentStatus for each claim
  // Query: for each unique (claimId, secondaryStatus) in rows, find earliest snapshotDate
  const claimStatusPairs = rows.map(r => ({ claimId: r.claimId, secondaryStatus: r.secondaryStatus ?? null }));
  const uniquePairs = [...new Map(claimStatusPairs.map(p => [`${p.claimId}::${p.secondaryStatus}`, p])).values()];

  // Build days map using raw query approach — query per-claim earliest date with same secondary status
  const daysMap = new Map<string, number>();
  if (uniquePairs.length > 0) {
    // Batch lookup: get earliest snapshot date for each (claimId, secondaryStatus) pair
    // Use a single query with OR conditions — or chunked individual queries
    const DAYS_CHUNK = 200;
    for (let i = 0; i < uniquePairs.length; i += DAYS_CHUNK) {
      const chunk = uniquePairs.slice(i, i + DAYS_CHUNK);
      await Promise.all(
        chunk.map(async ({ claimId, secondaryStatus }) => {
          const earliest = await prisma.claimSnapshot.findFirst({
            where: {
              claimId,
              secondaryStatus: secondaryStatus ?? undefined,
              snapshotDate: { lte: snapshotDate },
            },
            orderBy: { snapshotDate: 'asc' },
            select: { snapshotDate: true },
          });
          if (earliest) {
            const days = Math.floor(
              (snapshotDate.getTime() - new Date(earliest.snapshotDate).getTime()) / 86400000
            );
            daysMap.set(claimId, days);
          }
        })
      );
    }
  }

  // Upsert snapshots in chunks of 500
  const CHUNK = 500;
  let created = 0;
  let updated = 0;
  let errored = 0;
  const errors: Array<{ claimId: string; error: string }> = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    for (const row of chunk) {
      try {
        const prev = prevMap.get(row.claimId);
        const deltaFlags = computeDelta(row, prev ? {
          claimStatus: prev.claimStatus,
          secondaryStatus: prev.secondaryStatus,
          totalIncurred: prev.totalIncurred ? Number(prev.totalIncurred) : null,
        } : null);
        const daysInCurrentStatus = daysMap.get(row.claimId) ?? 0;
        const isSlaBreach = computeSlaBreaches({ ...row, daysInCurrentStatus }, slaConfigs, snapshotDate);
        const complexityWeight = COMPLEXITY_WEIGHTS[row.cause ?? ''] ?? DEFAULT_WEIGHT;

        let notificationGapDays: number | null = null;
        if (row.dateOfLoss) {
          notificationGapDays = Math.floor(
            (snapshotDate.getTime() - new Date(row.dateOfLoss).getTime()) / 86400000
          );
        }

        let reserveUtilisationPct: number | null = null;
        if (row.intimatedAmount && row.totalIncurred && row.intimatedAmount > 0) {
          reserveUtilisationPct = (row.totalIncurred / row.intimatedAmount) * 100;
        }

        const data = {
          importRunId: importRun.id,
          snapshotDate,
          claimId: row.claimId,
          oldClaimId: row.oldClaimId ?? null,
          handler: row.handler ?? null,
          claimStatus: row.claimStatus ?? null,
          secondaryStatus: row.secondaryStatus ?? null,
          orgUnit: row.orgUnit ?? null,
          uwYear: row.uwYear ?? null,
          groupDesc: row.groupDesc ?? null,
          sectionDesc: row.sectionDesc ?? null,
          policyNumber: row.policyNumber ?? null,
          lossArea: row.lossArea ?? null,
          lossAddr: row.lossAddr ?? null,
          insured: row.insured ?? null,
          broker: row.broker ?? null,
          dateOfLoss: row.dateOfLoss ?? null,
          cause: row.cause ?? null,
          deductible: row.deductible ?? null,
          retainedPct: row.retainedPct ?? null,
          intimatedAmount: row.intimatedAmount ?? null,
          ownDamagePaid: row.ownDamagePaid ?? null,
          thirdPartyPaid: row.thirdPartyPaid ?? null,
          expensesPaid: row.expensesPaid ?? null,
          legalCostsPaid: row.legalCostsPaid ?? null,
          assessorFeesPaid: row.assessorFeesPaid ?? null,
          repairAuthPaid: row.repairAuthPaid ?? null,
          cashLieuPaid: row.cashLieuPaid ?? null,
          glassAuthPaid: row.glassAuthPaid ?? null,
          partsAuthPaid: row.partsAuthPaid ?? null,
          towingPaid: row.towingPaid ?? null,
          additionalsPaid: row.additionalsPaid ?? null,
          tpLiabilityPaid: row.tpLiabilityPaid ?? null,
          investigationPaid: row.investigationPaid ?? null,
          totalPaid: row.totalPaid ?? null,
          totalRecovery: row.totalRecovery ?? null,
          totalSalvage: row.totalSalvage ?? null,
          ownDamageOs: row.ownDamageOs ?? null,
          thirdPartyOs: row.thirdPartyOs ?? null,
          expensesOs: row.expensesOs ?? null,
          legalCostsOs: row.legalCostsOs ?? null,
          assessorFeesOs: row.assessorFeesOs ?? null,
          repairAuthOs: row.repairAuthOs ?? null,
          cashLieuOs: row.cashLieuOs ?? null,
          glassAuthOs: row.glassAuthOs ?? null,
          tpLiabilityOs: row.tpLiabilityOs ?? null,
          totalOs: row.totalOs ?? null,
          totalIncurred: row.totalIncurred ?? null,
          sectionSumInsured: row.sectionSumInsured ?? null,
          notificationGapDays,
          reserveUtilisationPct,
          complexityWeight,
          deltaFlags,
          isSlaBreach,
          daysInCurrentStatus,
        };

        const existing = await prisma.claimSnapshot.findUnique({
          where: { claimId_snapshotDate: { claimId: row.claimId, snapshotDate } },
          select: { id: true },
        });

        await prisma.claimSnapshot.upsert({
          where: { claimId_snapshotDate: { claimId: row.claimId, snapshotDate } },
          create: data,
          update: { ...data },
        });

        if (existing) {
          updated++;
        } else {
          created++;
        }
      } catch (err) {
        errored++;
        errors.push({ claimId: row.claimId, error: String(err) });
      }
    }
  }

  // Compute fraud/integrity flags
  try {
    await computeFlags(importRun.id, snapshotDate);
  } catch {
    // Non-fatal — log but continue
  }

  // Update ImportRun totals
  await prisma.importRun.update({
    where: { id: importRun.id },
    data: {
      rowsCreated: created,
      rowsUpdated: updated,
      rowsErrored: errored,
      errorsJson: errors.length > 0 ? errors : undefined,
      periodStart: snapshotDate,
      periodEnd: snapshotDate,
    },
  });

  return Response.json({
    success: true,
    importRunId: importRun.id,
    rowsRead: rows.length,
    rowsCreated: created,
    rowsUpdated: updated,
    rowsErrored: errored,
    snapshotDate: snapshotDate.toISOString(),
  });
}
