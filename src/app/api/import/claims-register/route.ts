export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { Prisma, ReportType } from '@prisma/client';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { parseClaimsRegisterReport } from '@/lib/parsers/claims-register-parser';

export async function POST(request: Request) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['HEAD_OF_CLAIMS', 'TEAM_LEADER'].includes(ctx.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let formData: FormData;
    try { formData = await request.formData(); }
    catch { return Response.json({ error: 'Invalid form data' }, { status: 400 }); }

    const file = formData.get('file') as File | null;
    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

    const buffer = await file.arrayBuffer();

    let parseResult: ReturnType<typeof parseClaimsRegisterReport>;
    try { parseResult = parseClaimsRegisterReport(buffer); }
    catch (err) {
      return Response.json({ error: 'Failed to parse file', detail: String(err) }, { status: 422 });
    }

    const { rows, snapshotDate, errors: parseErrors } = parseResult;

    // Create ImportRun
    const importRun = await prisma.importRun.create({
      data: {
        reportType: 'CLAIMS_REGISTER' as ReportType,
        filename: file.name,
        uploadedBy: ctx.userId,
        rowsRead: rows.length,
        rowsCreated: 0,
        rowsUpdated: 0,
      },
    });

    if (rows.length === 0) {
      await prisma.importRun.update({
        where: { id: importRun.id },
        data: { rowsCreated: 0, errorsJson: parseErrors.length > 0 ? parseErrors : undefined },
      });
      return Response.json({ success: true, importRunId: importRun.id, rowsRead: 0, rowsCreated: 0, rowsUpdated: 0, rowsSkipped: 0, parseErrors });
    }

    // Find existing snapshots for these claimIds at snapshotDate
    const claimIds = rows.map(r => r.claimId);
    const existing = await prisma.claimSnapshot.findMany({
      where: { claimId: { in: claimIds }, snapshotDate },
      select: { claimId: true, handler: true, dateOfRegistration: true },
    });
    const existingMap = new Map(existing.map(e => [e.claimId, e]));

    const toInsert = rows.filter(r => !existingMap.has(r.claimId));
    const toUpdate = rows.filter(r => existingMap.has(r.claimId));

    let rowsCreated = 0;
    let rowsUpdated = 0;

    // STUB INSERT: claims not yet in outstanding report
    const BATCH = 200;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const values = batch.map(r => Prisma.sql`(
        gen_random_uuid(),
        ${importRun.id}::uuid,
        ${r.claimId},
        ${snapshotDate}::date,
        ${r.handler ?? r.capturedBy ?? null},
        ${r.dateOfRegistration}::date,
        ${r.dateOfLoss}::date,
        ${r.claimStatus},
        ${r.secondaryStatus},
        ${r.cause},
        ${r.insured},
        ${r.broker},
        ${r.policyNumber},
        ${r.intimatedAmount},
        ${r.grossIncurred},
        ${r.isCatastrophe},
        true
      )`);

      await prisma.$executeRaw`
        INSERT INTO claim_snapshots (
          id, import_run_id, claim_id, snapshot_date,
          handler, date_of_registration, date_of_loss,
          claim_status, secondary_status, cause,
          insured, broker, policy_number,
          intimated_amount, total_incurred,
          is_catastrophe, is_stub
        )
        VALUES ${Prisma.join(values)}
        ON CONFLICT (claim_id, snapshot_date) DO NOTHING
      `;
      rowsCreated += batch.length;
    }

    // UPDATE: fill dateOfRegistration and isCatastrophe on existing snapshots
    // handler: only update if current value is null/'Not defined'/empty
    const updateBatch = toUpdate.map(r => {
      const ex = existingMap.get(r.claimId)!;
      const handlerIsEmpty = !ex.handler || ex.handler === 'Not defined' || ex.handler.trim() === '';
      return { ...r, useHandlerFromReg: handlerIsEmpty };
    });

    for (let i = 0; i < updateBatch.length; i += BATCH) {
      const batch = updateBatch.slice(i, i + BATCH);
      const values = batch.map(r => Prisma.sql`(
        ${r.claimId},
        ${r.dateOfRegistration}::date,
        ${r.isCatastrophe},
        ${r.useHandlerFromReg ? (r.handler ?? r.capturedBy ?? null) : null}
      )`);

      await prisma.$executeRaw`
        UPDATE claim_snapshots AS cs
        SET
          date_of_registration = COALESCE(cs.date_of_registration, v.dor),
          is_catastrophe = v.is_cat::boolean,
          handler = CASE
            WHEN v.handler_override IS NOT NULL AND (cs.handler IS NULL OR cs.handler = '' OR cs.handler = 'Not defined')
            THEN v.handler_override
            ELSE cs.handler
          END
        FROM (VALUES ${Prisma.join(values)}) AS v(claim_id, dor, is_cat, handler_override)
        WHERE cs.claim_id = v.claim_id
          AND cs.snapshot_date = ${snapshotDate}::date
      `;
      rowsUpdated += batch.length;
    }

    // Recompute daysOpen for all touched claims
    const touchedIds = rows.map(r => r.claimId);
    if (touchedIds.length > 0) {
      const { recomputeClaimAges } = await import('@/lib/compute/recompute-claim-ages');
      await recomputeClaimAges(touchedIds, snapshotDate);
    }

    await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        rowsCreated,
        rowsUpdated,
        periodStart: snapshotDate,
        periodEnd: snapshotDate,
        errorsJson: parseErrors.length > 0 ? parseErrors : undefined,
      },
    });

    return Response.json({
      success: true,
      importRunId: importRun.id,
      rowsRead: rows.length,
      rowsCreated,
      rowsUpdated,
      rowsSkipped: rows.length - rowsCreated - rowsUpdated,
      snapshotDate: snapshotDate.toISOString(),
      parseErrors,
    });

  } catch (err) {
    console.error('[claims-register import]', err);
    const msg = err instanceof Error ? err.message : 'Internal error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
