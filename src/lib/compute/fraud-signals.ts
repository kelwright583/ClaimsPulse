import { prisma } from '@/lib/prisma';

export async function computeFlags(importRunId: string, snapshotDate: Date): Promise<void> {
  // Delete old flags for this import run before recomputing
  await prisma.claimFlag.deleteMany({ where: { importRunId } });

  const flags: Array<{
    importRunId: string;
    claimId: string;
    flagType: string;
    severity: string;
    detail: object | null;
  }> = [];

  // Fetch all snapshots for this import run
  const snapshots = await prisma.claimSnapshot.findMany({
    where: { importRunId },
    select: {
      claimId: true,
      handler: true,
      claimStatus: true,
      secondaryStatus: true,
      cause: true,
      totalIncurred: true,
      intimatedAmount: true,
      totalPaid: true,
      cashLieuPaid: true,
      repairAuthPaid: true,
      insured: true,
      dateOfLoss: true,
      snapshotDate: true,
      isTatBreach: true,
      daysInCurrentStatus: true,
      deltaFlags: true,
    },
  });

  const snapshotMap = new Map(snapshots.map(s => [s.claimId, s]));

  // 1. BIG_CLAIM: totalIncurred > 250000 OR cause contains 'theft'/'hijack'
  for (const s of snapshots) {
    const incurred = Number(s.totalIncurred ?? 0);
    const causeStr = (s.cause ?? '').toLowerCase();
    const isBig = incurred > 250000 || causeStr.includes('theft') || causeStr.includes('hijack');
    if (isBig) {
      flags.push({
        importRunId,
        claimId: s.claimId,
        flagType: 'BIG_CLAIM',
        severity: 'alert',
        detail: { totalIncurred: incurred, cause: s.cause },
      });
    }
  }

  // 2. RESERVE_UNDER: totalIncurred > 80% of intimatedAmount
  for (const s of snapshots) {
    const incurred = Number(s.totalIncurred ?? 0);
    const intimated = Number(s.intimatedAmount ?? 0);
    if (intimated > 0 && incurred > intimated * 0.8) {
      flags.push({
        importRunId,
        claimId: s.claimId,
        flagType: 'RESERVE_UNDER',
        severity: 'warning',
        detail: { totalIncurred: incurred, intimatedAmount: intimated },
      });
    }
  }

  // 3. RESERVE_OVER: intimatedAmount > 3x totalIncurred AND claim open > 30 days
  for (const s of snapshots) {
    const incurred = Number(s.totalIncurred ?? 0);
    const intimated = Number(s.intimatedAmount ?? 0);
    const dateOfLoss = s.dateOfLoss ? new Date(s.dateOfLoss) : null;
    const daysOpen = dateOfLoss
      ? Math.floor((snapshotDate.getTime() - dateOfLoss.getTime()) / 86400000)
      : 0;
    if (incurred > 0 && intimated > incurred * 3 && daysOpen > 30) {
      flags.push({
        importRunId,
        claimId: s.claimId,
        flagType: 'RESERVE_OVER',
        severity: 'warning',
        detail: { totalIncurred: incurred, intimatedAmount: intimated, daysOpen },
      });
    }
  }

  // 4. DUPLICATE_INSURED: same insured on 3+ claims in rolling 90 days
  const ninetyDaysAgo = new Date(snapshotDate.getTime() - 90 * 86400000);
  const recentSnapshots = await prisma.claimSnapshot.findMany({
    where: {
      snapshotDate: { gte: ninetyDaysAgo, lte: snapshotDate },
      insured: { not: null },
    },
    select: { claimId: true, insured: true },
    distinct: ['claimId'],
  });

  const insuredCounts = new Map<string, Set<string>>();
  for (const s of recentSnapshots) {
    if (!s.insured) continue;
    if (!insuredCounts.has(s.insured)) insuredCounts.set(s.insured, new Set());
    insuredCounts.get(s.insured)!.add(s.claimId);
  }

  for (const s of snapshots) {
    if (!s.insured) continue;
    const claimSet = insuredCounts.get(s.insured);
    if (claimSet && claimSet.size >= 3) {
      flags.push({
        importRunId,
        claimId: s.claimId,
        flagType: 'DUPLICATE_INSURED',
        severity: 'warning',
        detail: { insured: s.insured, claimCount: claimSet.size },
      });
    }
  }

  // 5. DUPLICATE_PAYEE_VAT: same payeeVatNr on 5+ payments in 30 days
  const thirtyDaysAgo = new Date(snapshotDate.getTime() - 30 * 86400000);
  const recentPayments = await prisma.payment.findMany({
    where: {
      printedDate: { gte: thirtyDaysAgo, lte: snapshotDate },
      payeeVatNr: { not: null },
    },
    select: { claimId: true, payeeVatNr: true },
  });

  const vatCounts = new Map<string, { claimIds: Set<string>; count: number }>();
  for (const p of recentPayments) {
    if (!p.payeeVatNr) continue;
    if (!vatCounts.has(p.payeeVatNr)) vatCounts.set(p.payeeVatNr, { claimIds: new Set(), count: 0 });
    const entry = vatCounts.get(p.payeeVatNr)!;
    entry.count++;
    entry.claimIds.add(p.claimId);
  }

  for (const s of snapshots) {
    // Check payments for this claim in this import's timeframe
    const claimPayments = recentPayments.filter(p => p.claimId === s.claimId && p.payeeVatNr);
    for (const cp of claimPayments) {
      const vatEntry = vatCounts.get(cp.payeeVatNr!);
      if (vatEntry && vatEntry.count >= 5) {
        flags.push({
          importRunId,
          claimId: s.claimId,
          flagType: 'DUPLICATE_PAYEE_VAT',
          severity: 'warning',
          detail: { payeeVatNr: cp.payeeVatNr, paymentCount: vatEntry.count },
        });
        break; // only one flag per claim
      }
    }
  }

  // 6. CASH_LIEU_AND_REPAIR: both cashLieuPaid > 0 AND repairAuthPaid > 0
  for (const s of snapshots) {
    const cashLieu = Number(s.cashLieuPaid ?? 0);
    const repairAuth = Number(s.repairAuthPaid ?? 0);
    if (cashLieu > 0 && repairAuth > 0) {
      flags.push({
        importRunId,
        claimId: s.claimId,
        flagType: 'CASH_LIEU_AND_REPAIR',
        severity: 'alert',
        detail: { cashLieuPaid: cashLieu, repairAuthPaid: repairAuth },
      });
    }
  }

  // 7. SAME_DAY_AUTH_PRINT: from payments table (already computed on payment insert)
  const sameDayPayments = await prisma.payment.findMany({
    where: {
      importRunId,
      sameDayAuthPrint: true,
    },
    select: { claimId: true, chequeNo: true, authorisedDate: true, printedDate: true },
    distinct: ['claimId'],
  });

  for (const p of sameDayPayments) {
    flags.push({
      importRunId,
      claimId: p.claimId,
      flagType: 'SAME_DAY_AUTH_PRINT',
      severity: 'alert',
      detail: { chequeNo: p.chequeNo, authorisedDate: p.authorisedDate, printedDate: p.printedDate },
    });
  }

  // 8. SELF_AUTHORISED: from payments table
  const selfAuthPayments = await prisma.payment.findMany({
    where: {
      importRunId,
      selfAuthorised: true,
    },
    select: { claimId: true, chequeNo: true, requestedBy: true, handler: true },
    distinct: ['claimId'],
  });

  for (const p of selfAuthPayments) {
    flags.push({
      importRunId,
      claimId: p.claimId,
      flagType: 'SELF_AUTHORISED',
      severity: 'alert',
      detail: { chequeNo: p.chequeNo, requestedBy: p.requestedBy, handler: p.handler },
    });
  }

  // 9. VALUE_CREEP: totalIncurred > intimatedAmount
  for (const s of snapshots) {
    const incurred = Number(s.totalIncurred ?? 0);
    const intimated = Number(s.intimatedAmount ?? 0);
    if (intimated > 0 && incurred > intimated) {
      flags.push({
        importRunId,
        claimId: s.claimId,
        flagType: 'VALUE_CREEP',
        severity: 'warning',
        detail: { totalIncurred: incurred, intimatedAmount: intimated },
      });
    }
  }

  // 10. UNASSIGNED: handler is null AND totalPaid > 0
  for (const s of snapshots) {
    const totalPaid = Number(s.totalPaid ?? 0);
    if (!s.handler && totalPaid > 0) {
      flags.push({
        importRunId,
        claimId: s.claimId,
        flagType: 'UNASSIGNED',
        severity: 'warning',
        detail: { totalPaid },
      });
    }
  }

  // 11. NO_PAYMENT_30_DAYS: claim open > 30 days, totalPaid == 0, status not 'Finalised'/'Repudiated'/'Cancelled'
  const excludedStatuses = new Set(['Finalised', 'Repudiated', 'Cancelled']);
  for (const s of snapshots) {
    const totalPaid = Number(s.totalPaid ?? 0);
    if (excludedStatuses.has(s.claimStatus ?? '')) continue;
    const dateOfLoss = s.dateOfLoss ? new Date(s.dateOfLoss) : null;
    const daysOpen = dateOfLoss
      ? Math.floor((snapshotDate.getTime() - dateOfLoss.getTime()) / 86400000)
      : 0;
    if (daysOpen > 30 && totalPaid === 0) {
      flags.push({
        importRunId,
        claimId: s.claimId,
        flagType: 'NO_PAYMENT_30_DAYS',
        severity: 'warning',
        detail: { daysOpen, claimStatus: s.claimStatus },
      });
    }
  }

  // 12. REOPENED: deltaFlags contains "reopened": true
  for (const s of snapshots) {
    const delta = s.deltaFlags as Record<string, unknown> | null;
    if (delta && delta['reopened'] === true) {
      flags.push({
        importRunId,
        claimId: s.claimId,
        flagType: 'REOPENED',
        severity: 'warning',
        detail: { previousStatus: delta['previousStatus'] ?? null, currentStatus: s.claimStatus },
      });
    }
  }

  // 13. TAT_BREACH: isTatBreach === true
  for (const s of snapshots) {
    if (s.isTatBreach === true) {
      flags.push({
        importRunId,
        claimId: s.claimId,
        flagType: 'TAT_BREACH',
        severity: 'alert',
        detail: { secondaryStatus: s.secondaryStatus, daysInCurrentStatus: s.daysInCurrentStatus },
      });
    }
  }

  // Batch insert all flags
  const BATCH = 500;
  for (let i = 0; i < flags.length; i += BATCH) {
    const batch = flags.slice(i, i + BATCH);
    await prisma.claimFlag.createMany({
      data: batch.map(f => ({
        importRunId: f.importRunId,
        claimId: f.claimId,
        flagType: f.flagType as any,
        severity: f.severity,
        detail: f.detail ?? undefined,
      })),
    });
  }
}
