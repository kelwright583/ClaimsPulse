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
  try {
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

  // Run all pre-insert DB reads in parallel — they are fully independent of each other
  const claimIds = rows.map(r => r.claimId);

  const [previousSnapshots, slaConfigs, priorSnapshotsForDays, existingSnapshots] = await Promise.all([
    // Latest snapshot per claimId from any prior date (for delta flags)
    prisma.claimSnapshot.findMany({
      where: { snapshotDate: { lt: snapshotDate } },
      orderBy: { snapshotDate: 'desc' },
      distinct: ['claimId'],
      select: { claimId: true, claimStatus: true, secondaryStatus: true, totalIncurred: true, totalOs: true },
    }),
    // SLA config (small table)
    prisma.slaConfig.findMany({ where: { isActive: true } }),
    // All prior snapshots for these claims (for daysInCurrentStatus)
    prisma.claimSnapshot.findMany({
      where: { claimId: { in: claimIds }, snapshotDate: { lte: snapshotDate } },
      select: { claimId: true, secondaryStatus: true, snapshotDate: true },
      orderBy: { snapshotDate: 'asc' },
    }),
    // Existing snapshots for today (for create vs update counting)
    prisma.claimSnapshot.findMany({
      where: { snapshotDate },
      select: { claimId: true },
    }),
  ]);

  const prevMap = new Map(previousSnapshots.map(s => [s.claimId, s]));

  // Earliest snapshot date per (claimId, secondaryStatus) — used for daysInCurrentStatus
  const earliestMap = new Map<string, Date>();
  for (const s of priorSnapshotsForDays) {
    const key = `${s.claimId}::${s.secondaryStatus ?? ''}`;
    if (!earliestMap.has(key)) earliestMap.set(key, new Date(s.snapshotDate));
  }

  const daysMap = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.claimId}::${row.secondaryStatus ?? ''}`;
    const earliest = earliestMap.get(key);
    if (earliest) {
      daysMap.set(row.claimId, Math.floor((snapshotDate.getTime() - earliest.getTime()) / 86400000));
    }
  }

  const existingClaimIds = new Set(existingSnapshots.map(s => s.claimId));

  // Pre-compute all row data objects (CPU only — no DB calls)
  const rowDataList = rows.map(row => {
    const prev = prevMap.get(row.claimId);
    const deltaFlags = computeDelta(row, prev ? {
      claimStatus: prev.claimStatus,
      secondaryStatus: prev.secondaryStatus,
      totalIncurred: prev.totalIncurred ? Number(prev.totalIncurred) : null,
    } : null);
    const daysInCurrentStatus = daysMap.get(row.claimId) ?? 0;
    const isSlaBreach = computeSlaBreaches({ ...row, daysInCurrentStatus }, slaConfigs, snapshotDate);
    const complexityWeight = COMPLEXITY_WEIGHTS[row.cause ?? ''] ?? DEFAULT_WEIGHT;

    const notificationGapDays = row.dateOfLoss
      ? Math.floor((snapshotDate.getTime() - new Date(row.dateOfLoss).getTime()) / 86400000)
      : null;

    const reserveUtilisationPct =
      row.intimatedAmount && row.totalIncurred && row.intimatedAmount > 0
        ? (row.totalIncurred / row.intimatedAmount) * 100
        : null;

    return {
      claimId: row.claimId,
      data: {
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
      },
    };
  });

  let created = 0;
  let updated = 0;
  let errored = 0;
  const errors: Array<{ claimId: string; error: string }> = [];

  // Split rows into new vs existing for this snapshot date
  const toCreate = rowDataList.filter(({ claimId }) => !existingClaimIds.has(claimId));
  const toUpdate = rowDataList.filter(({ claimId }) => existingClaimIds.has(claimId));

  // --- Bulk-create new snapshots in chunks of 500 ---
  if (toCreate.length > 0) {
    const CREATE_CHUNK = 500;
    for (let i = 0; i < toCreate.length; i += CREATE_CHUNK) {
      const chunk = toCreate.slice(i, i + CREATE_CHUNK);
      try {
        const result = await prisma.claimSnapshot.createMany({
          data: chunk.map(({ data }) => data),
          skipDuplicates: true,
        });
        created += result.count;
      } catch {
        for (const { claimId, data } of chunk) {
          try {
            await prisma.claimSnapshot.create({ data });
            created++;
          } catch (rowErr) {
            errored++;
            errors.push({ claimId, error: String(rowErr) });
          }
        }
      }
    }
  }

  // --- Batch-update existing snapshots in chunks of 50 (array-form $transaction per chunk) ---
  if (toUpdate.length > 0) {
    const UPDATE_CHUNK = 50;
    for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK) {
      const chunk = toUpdate.slice(i, i + UPDATE_CHUNK);
      try {
        await prisma.$transaction(
          chunk.map(({ claimId, data }) =>
            prisma.claimSnapshot.update({
              where: { claimId_snapshotDate: { claimId, snapshotDate } },
              data,
            })
          )
        );
        updated += chunk.length;
      } catch {
        for (const { claimId, data } of chunk) {
          try {
            await prisma.claimSnapshot.update({
              where: { claimId_snapshotDate: { claimId, snapshotDate } },
              data,
            });
            updated++;
          } catch (rowErr) {
            errored++;
            errors.push({ claimId, error: String(rowErr) });
          }
        }
      }
    }
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
  } catch (err) {
    console.error('[claims-import]', err);
    return Response.json(
      { error: 'Import failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
