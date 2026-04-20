export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { parseClaimsReport } from '@/lib/parsers/claims-parser';
import { computeDelta } from '@/lib/compute/delta';
import { computeTatBreaches } from '@/lib/compute/sla';
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

  const [previousSnapshots, tatConfigs, priorSnapshotsForDays, existingSnapshots] = await Promise.all([
    // Latest snapshot per claimId from any prior date (for delta flags)
    prisma.claimSnapshot.findMany({
      where: { snapshotDate: { lt: snapshotDate } },
      orderBy: { snapshotDate: 'desc' },
      distinct: ['claimId'],
      select: { claimId: true, claimStatus: true, secondaryStatus: true, totalIncurred: true, totalOs: true },
    }),
    // SLA config (small table)
    prisma.tatConfig.findMany({ where: { isActive: true } }),
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
    // daysInCurrentStatus: use import history if available, else fall back to DOL
    const daysInCurrentStatus = daysMap.get(row.claimId)
      ?? (row.dateOfLoss
        ? Math.floor((snapshotDate.getTime() - new Date(row.dateOfLoss).getTime()) / 86400000)
        : 0);
    const isTatBreach = computeTatBreaches({ ...row, daysInCurrentStatus }, tatConfigs, snapshotDate);
    const complexityWeight = COMPLEXITY_WEIGHTS[row.cause ?? ''] ?? DEFAULT_WEIGHT;

    // notificationGapDays: dateOfNotification - dateOfLoss
    // dateOfNotification is NOT in the daily claims report — it's populated by the payee import.
    // This will always be null here; the payee route back-fills it on ClaimSnapshot rows.
    const notificationGapDays: null = null;

    // daysOpen: claim age since DOL (best available in the claims report; payee import provides
    // dateOfRegistration which would be more accurate, but that isn't in this file's data)
    const daysOpen = row.dateOfLoss
      ? Math.floor((snapshotDate.getTime() - new Date(row.dateOfLoss).getTime()) / 86400000)
      : null;

    const reserveUtilisationPctRaw =
      row.intimatedAmount && row.totalIncurred && row.intimatedAmount > 0
        ? (row.totalIncurred / row.intimatedAmount) * 100
        : null;

    // Cap at 999999.99 — the column is Decimal(8,2)
    const reserveUtilisationPct =
      reserveUtilisationPctRaw !== null
        ? Math.min(reserveUtilisationPctRaw, 999999.99)
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
        isTatBreach,
        daysInCurrentStatus,
        daysOpen,
      },
    };
  });

  // Deduplicate by claimId — last row wins (matches upsert behaviour)
  const deduped = new Map<string, typeof rowDataList[number]>();
  for (const row of rowDataList) {
    deduped.set(row.claimId, row);
  }
  const dedupedList = Array.from(deduped.values());

  let created = 0;
  let updated = 0;
  let errored = 0;
  const errors: Array<{ claimId: string; error: string }> = [];

  const SQL_CHUNK = 200;

  for (let i = 0; i < dedupedList.length; i += SQL_CHUNK) {
    const chunk = dedupedList.slice(i, i + SQL_CHUNK);
    if (!chunk.length) continue;

    try {
      const values = chunk.map(({ data: d }) => Prisma.sql`(
        gen_random_uuid(),
        ${d.importRunId}::uuid,
        ${d.snapshotDate}::date,
        ${d.claimId},
        ${d.oldClaimId},
        ${d.handler},
        ${d.claimStatus},
        ${d.secondaryStatus},
        ${d.orgUnit},
        ${d.uwYear}::int,
        ${d.groupDesc},
        ${d.sectionDesc},
        ${d.policyNumber},
        ${d.insured},
        ${d.broker},
        ${d.dateOfLoss}::date,
        ${d.cause},
        ${d.lossArea},
        ${d.lossAddr},
        ${d.intimatedAmount}::decimal,
        ${d.retainedPct}::decimal,
        ${d.deductible}::decimal,
        ${d.ownDamagePaid}::decimal,
        ${d.thirdPartyPaid}::decimal,
        ${d.expensesPaid}::decimal,
        ${d.legalCostsPaid}::decimal,
        ${d.assessorFeesPaid}::decimal,
        ${d.repairAuthPaid}::decimal,
        ${d.cashLieuPaid}::decimal,
        ${d.glassAuthPaid}::decimal,
        ${d.partsAuthPaid}::decimal,
        ${d.towingPaid}::decimal,
        ${d.additionalsPaid}::decimal,
        ${d.tpLiabilityPaid}::decimal,
        ${d.investigationPaid}::decimal,
        ${d.totalPaid}::decimal,
        ${d.totalRecovery}::decimal,
        ${d.totalSalvage}::decimal,
        ${d.ownDamageOs}::decimal,
        ${d.thirdPartyOs}::decimal,
        ${d.expensesOs}::decimal,
        ${d.legalCostsOs}::decimal,
        ${d.assessorFeesOs}::decimal,
        ${d.repairAuthOs}::decimal,
        ${d.cashLieuOs}::decimal,
        ${d.glassAuthOs}::decimal,
        ${d.tpLiabilityOs}::decimal,
        ${d.totalOs}::decimal,
        ${d.totalIncurred}::decimal,
        ${d.sectionSumInsured}::decimal,
        ${d.notificationGapDays}::int,
        ${d.reserveUtilisationPct}::decimal,
        ${d.complexityWeight}::int,
        ${JSON.stringify(d.deltaFlags)}::jsonb,
        ${d.isTatBreach},
        ${d.daysInCurrentStatus}::int,
        ${d.daysOpen}::int
      )`);

      await prisma.$executeRaw`
        INSERT INTO claim_snapshots (
          id, import_run_id, snapshot_date, claim_id, old_claim_id,
          handler, claim_status, secondary_status,
          org_unit, uw_year, group_desc, section_desc,
          policy_number, insured, broker,
          date_of_loss, cause, loss_area, loss_addr,
          intimated_amount, retained_pct, deductible,
          own_damage_paid, third_party_paid, expenses_paid,
          legal_costs_paid, assessor_fees_paid, repair_auth_paid,
          cash_lieu_paid, glass_auth_paid, parts_auth_paid,
          towing_paid, additionals_paid, tp_liability_paid,
          investigation_paid, total_paid, total_recovery, total_salvage,
          own_damage_os, third_party_os, expenses_os,
          legal_costs_os, assessor_fees_os, repair_auth_os,
          cash_lieu_os, glass_auth_os, tp_liability_os,
          total_os, total_incurred, section_sum_insured,
          notification_gap_days, reserve_utilisation_pct,
          complexity_weight, delta_flags, is_sla_breach,
          days_in_current_status, days_open
        ) VALUES ${Prisma.join(values)}
        ON CONFLICT (claim_id, snapshot_date) DO UPDATE SET
          import_run_id = EXCLUDED.import_run_id,
          old_claim_id = EXCLUDED.old_claim_id,
          handler = EXCLUDED.handler,
          claim_status = EXCLUDED.claim_status,
          secondary_status = EXCLUDED.secondary_status,
          org_unit = EXCLUDED.org_unit,
          uw_year = EXCLUDED.uw_year,
          group_desc = EXCLUDED.group_desc,
          section_desc = EXCLUDED.section_desc,
          policy_number = EXCLUDED.policy_number,
          insured = EXCLUDED.insured,
          broker = EXCLUDED.broker,
          date_of_loss = EXCLUDED.date_of_loss,
          cause = EXCLUDED.cause,
          loss_area = EXCLUDED.loss_area,
          loss_addr = EXCLUDED.loss_addr,
          intimated_amount = EXCLUDED.intimated_amount,
          retained_pct = EXCLUDED.retained_pct,
          deductible = EXCLUDED.deductible,
          own_damage_paid = EXCLUDED.own_damage_paid,
          third_party_paid = EXCLUDED.third_party_paid,
          expenses_paid = EXCLUDED.expenses_paid,
          legal_costs_paid = EXCLUDED.legal_costs_paid,
          assessor_fees_paid = EXCLUDED.assessor_fees_paid,
          repair_auth_paid = EXCLUDED.repair_auth_paid,
          cash_lieu_paid = EXCLUDED.cash_lieu_paid,
          glass_auth_paid = EXCLUDED.glass_auth_paid,
          parts_auth_paid = EXCLUDED.parts_auth_paid,
          towing_paid = EXCLUDED.towing_paid,
          additionals_paid = EXCLUDED.additionals_paid,
          tp_liability_paid = EXCLUDED.tp_liability_paid,
          investigation_paid = EXCLUDED.investigation_paid,
          total_paid = EXCLUDED.total_paid,
          total_recovery = EXCLUDED.total_recovery,
          total_salvage = EXCLUDED.total_salvage,
          own_damage_os = EXCLUDED.own_damage_os,
          third_party_os = EXCLUDED.third_party_os,
          expenses_os = EXCLUDED.expenses_os,
          legal_costs_os = EXCLUDED.legal_costs_os,
          assessor_fees_os = EXCLUDED.assessor_fees_os,
          repair_auth_os = EXCLUDED.repair_auth_os,
          cash_lieu_os = EXCLUDED.cash_lieu_os,
          glass_auth_os = EXCLUDED.glass_auth_os,
          tp_liability_os = EXCLUDED.tp_liability_os,
          total_os = EXCLUDED.total_os,
          total_incurred = EXCLUDED.total_incurred,
          section_sum_insured = EXCLUDED.section_sum_insured,
          notification_gap_days = EXCLUDED.notification_gap_days,
          reserve_utilisation_pct = EXCLUDED.reserve_utilisation_pct,
          complexity_weight = EXCLUDED.complexity_weight,
          delta_flags = EXCLUDED.delta_flags,
          is_sla_breach = EXCLUDED.is_sla_breach,
          days_in_current_status = EXCLUDED.days_in_current_status,
          days_open = EXCLUDED.days_open
      `;

      for (const { claimId } of chunk) {
        if (existingClaimIds.has(claimId)) { updated++; } else { created++; }
      }
    } catch (err) {
      console.error(`[claims-import] chunk ${i}–${i + chunk.length} failed:`, err);
      // Chunk failed — fall back to row-by-row for this chunk only
      for (const { claimId, data: d } of chunk) {
        try {
          await prisma.$executeRaw`
            INSERT INTO claim_snapshots (
              id, import_run_id, snapshot_date, claim_id, old_claim_id,
              handler, claim_status, secondary_status,
              org_unit, uw_year, group_desc, section_desc,
              policy_number, insured, broker,
              date_of_loss, cause, loss_area, loss_addr,
              intimated_amount, retained_pct, deductible,
              own_damage_paid, third_party_paid, expenses_paid,
              legal_costs_paid, assessor_fees_paid, repair_auth_paid,
              cash_lieu_paid, glass_auth_paid, parts_auth_paid,
              towing_paid, additionals_paid, tp_liability_paid,
              investigation_paid, total_paid, total_recovery, total_salvage,
              own_damage_os, third_party_os, expenses_os,
              legal_costs_os, assessor_fees_os, repair_auth_os,
              cash_lieu_os, glass_auth_os, tp_liability_os,
              total_os, total_incurred, section_sum_insured,
              notification_gap_days, reserve_utilisation_pct,
              complexity_weight, delta_flags, is_sla_breach,
              days_in_current_status, days_open
            ) VALUES (
              gen_random_uuid(),
              ${d.importRunId}::uuid, ${d.snapshotDate}::date,
              ${d.claimId}, ${d.oldClaimId},
              ${d.handler}, ${d.claimStatus}, ${d.secondaryStatus},
              ${d.orgUnit}, ${d.uwYear}::int, ${d.groupDesc}, ${d.sectionDesc},
              ${d.policyNumber}, ${d.insured}, ${d.broker},
              ${d.dateOfLoss}::date, ${d.cause}, ${d.lossArea}, ${d.lossAddr},
              ${d.intimatedAmount}::decimal, ${d.retainedPct}::decimal, ${d.deductible}::decimal,
              ${d.ownDamagePaid}::decimal, ${d.thirdPartyPaid}::decimal, ${d.expensesPaid}::decimal,
              ${d.legalCostsPaid}::decimal, ${d.assessorFeesPaid}::decimal, ${d.repairAuthPaid}::decimal,
              ${d.cashLieuPaid}::decimal, ${d.glassAuthPaid}::decimal, ${d.partsAuthPaid}::decimal,
              ${d.towingPaid}::decimal, ${d.additionalsPaid}::decimal, ${d.tpLiabilityPaid}::decimal,
              ${d.investigationPaid}::decimal, ${d.totalPaid}::decimal, ${d.totalRecovery}::decimal,
              ${d.totalSalvage}::decimal,
              ${d.ownDamageOs}::decimal, ${d.thirdPartyOs}::decimal, ${d.expensesOs}::decimal,
              ${d.legalCostsOs}::decimal, ${d.assessorFeesOs}::decimal, ${d.repairAuthOs}::decimal,
              ${d.cashLieuOs}::decimal, ${d.glassAuthOs}::decimal, ${d.tpLiabilityOs}::decimal,
              ${d.totalOs}::decimal, ${d.totalIncurred}::decimal, ${d.sectionSumInsured}::decimal,
              ${d.notificationGapDays}::int, ${d.reserveUtilisationPct}::decimal,
              ${d.complexityWeight}::int, ${JSON.stringify(d.deltaFlags)}::jsonb,
              ${d.isTatBreach}, ${d.daysInCurrentStatus}::int, ${d.daysOpen}::int
            )
            ON CONFLICT (claim_id, snapshot_date) DO UPDATE SET
              import_run_id = EXCLUDED.import_run_id,
              handler = EXCLUDED.handler,
              claim_status = EXCLUDED.claim_status,
              secondary_status = EXCLUDED.secondary_status,
              total_paid = EXCLUDED.total_paid,
              total_os = EXCLUDED.total_os,
              total_incurred = EXCLUDED.total_incurred,
              delta_flags = EXCLUDED.delta_flags,
              is_sla_breach = EXCLUDED.is_sla_breach,
              days_in_current_status = EXCLUDED.days_in_current_status,
              days_open = EXCLUDED.days_open
          `;
          if (existingClaimIds.has(claimId)) { updated++; } else { created++; }
        } catch (rowErr) {
          errored++;
          errors.push({ claimId, error: String(rowErr) });
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

  let flagsComputed = false;
  let flagComputationError: string | undefined;
  try {
    await computeFlags(importRun.id, snapshotDate);
    flagsComputed = true;
  } catch (err) {
    flagComputationError = err instanceof Error ? err.message : String(err);
    await prisma.importRun.update({
      where: { id: importRun.id },
      data: { errorsJson: { flagError: flagComputationError } },
    });
  }

  return Response.json({
    success: true,
    importRunId: importRun.id,
    rowsRead: rows.length,
    rowsCreated: created,
    rowsUpdated: updated,
    rowsSkipped: rows.length - dedupedList.length,
    rowsErrored: errored,
    snapshotDate: snapshotDate.toISOString(),
    flagsComputed,
    flagComputationError,
  });
  } catch (err) {
    console.error('[claims-import]', err);
    return Response.json(
      { error: 'Import failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
