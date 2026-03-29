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

  // Compute daysInCurrentStatus — fetch all prior snapshots for these claims in one query,
  // then find the earliest date per (claimId, secondaryStatus) in memory.
  const claimIds = rows.map(r => r.claimId);
  const priorSnapshotsForDays = await prisma.claimSnapshot.findMany({
    where: { claimId: { in: claimIds }, snapshotDate: { lte: snapshotDate } },
    select: { claimId: true, secondaryStatus: true, snapshotDate: true },
    orderBy: { snapshotDate: 'asc' },
  });

  // earliest[claimId:secondaryStatus] = earliest snapshotDate
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

  // Pre-fetch existing snapshots for this date in one query (for create/update counting)
  const existingSnapshots = await prisma.claimSnapshot.findMany({
    where: { snapshotDate },
    select: { claimId: true },
  });
  const existingClaimIds = new Set(existingSnapshots.map(s => s.claimId));

  let created = 0;
  let updated = 0;
  let errored = 0;
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

  // Run all upserts in a single transaction — one DB connection, sequential ops, no per-upsert round-trip overhead
  let created = 0;
  let updated = 0;
  let errored = 0;
  const errors: Array<{ claimId: string; error: string }> = [];

  try {
    await prisma.$transaction(
      rowDataList.map(({ claimId, data }) =>
        prisma.claimSnapshot.upsert({
          where: { claimId_snapshotDate: { claimId, snapshotDate } },
          create: data,
          update: { ...data },
        })
      ),
      { timeout: 20000 }
    );
    created = rowDataList.filter(({ claimId }) => !existingClaimIds.has(claimId)).length;
    updated = rowDataList.filter(({ claimId }) => existingClaimIds.has(claimId)).length;
  } catch (txErr) {
    // Transaction failed — fall back to row-by-row so partial success is recorded
    for (const { claimId, data } of rowDataList) {
      try {
        await prisma.claimSnapshot.upsert({
          where: { claimId_snapshotDate: { claimId, snapshotDate } },
          create: data,
          update: { ...data },
        });
        if (existingClaimIds.has(claimId)) { updated++; } else { created++; }
      } catch (err) {
        errored++;
        errors.push({ claimId, error: String(err) });
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
  } catch (err) {
    console.error('[claims-import]', err);
    return Response.json(
      { error: 'Import failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
