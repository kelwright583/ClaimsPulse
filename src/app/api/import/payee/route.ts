export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { parsePayeeReport } from '@/lib/parsers/payee-parser';

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

    let parseResult: Awaited<ReturnType<typeof parsePayeeReport>>;
    try {
      parseResult = parsePayeeReport(buffer);
    } catch (err) {
      return Response.json({ error: 'Failed to parse file', detail: String(err) }, { status: 422 });
    }

    const { rows } = parseResult;

    const importRun = await prisma.importRun.create({
      data: {
        reportType: 'PAYEE',
        filename: file.name,
        uploadedBy: ctx.userId,
        rowsRead: rows.length,
      },
    });

    // Fetch existing payments for any claimId in this import using IN (far cheaper than OR pairs)
    const claimIdsInImport = [...new Set(rows.map(r => r.claimId))];
    const existingPayments = claimIdsInImport.length > 0
      ? await prisma.payment.findMany({
          where: { claimId: { in: claimIdsInImport } },
          select: { id: true, claimId: true, chequeNo: true },
        })
      : [];

    // Map "claimId:chequeNo" → payment id for O(1) lookup
    const existingMap = new Map(
      existingPayments.map(p => [`${p.claimId}:${p.chequeNo}`, p.id])
    );

    const toCreate: typeof rows = [];
    const toUpdate: Array<{ id: string; row: (typeof rows)[number] }> = [];

    for (const row of rows) {
      const key = row.chequeNo ? `${row.claimId}:${row.chequeNo}` : null;
      const existingId = key ? existingMap.get(key) : undefined;
      if (existingId) {
        toUpdate.push({ id: existingId, row });
      } else {
        toCreate.push(row);
      }
    }

    const errors: Array<{ claimId: string; error: string }> = [];
    const SQL_CHUNK = 500;
    let created = 0;

    // --- Bulk-insert new payments via $executeRaw (single SQL per chunk) ---
    for (let i = 0; i < toCreate.length; i += SQL_CHUNK) {
      const chunk = toCreate.slice(i, i + SQL_CHUNK);
      if (!chunk.length) continue;

      try {
        const values = chunk.map(r => Prisma.sql`(
          gen_random_uuid(),
          ${importRun.id}::uuid,
          ${r.claimId},
          ${r.handler ?? null},
          ${r.chequeNo ?? null},
          ${r.payee ?? null},
          ${r.payeeVatNr ?? null},
          ${r.paymentType ?? null},
          ${r.requestedBy ?? null},
          ${r.requestedDate ?? null}::date,
          ${r.authorisedDate ?? null}::date,
          ${r.printedDate ?? null}::date,
          ${r.grossPaidInclVat ?? null}::decimal,
          ${r.grossPaidExclVat ?? null}::decimal,
          ${r.netPaidInclVat ?? null}::decimal,
          ${r.broker ?? null},
          ${r.policyNumber ?? null},
          ${r.insured ?? null},
          ${r.claimStatus ?? null},
          ${r.sameDayAuthPrint},
          ${r.selfAuthorised},
          ${r.daysRequestToprint ?? null}::int
        )`);

        await prisma.$executeRaw`
          INSERT INTO payments (
            id, import_run_id, claim_id, handler, cheque_no, payee,
            payee_vat_nr, payment_type, requested_by,
            requested_date, authorised_date, printed_date,
            gross_paid_incl_vat, gross_paid_excl_vat, net_paid_incl_vat,
            broker, policy_number, insured, claim_status,
            same_day_auth_print, self_authorised, days_request_to_print
          ) VALUES ${Prisma.join(values)}
        `;
        created += chunk.length;
      } catch {
        for (const row of chunk) {
          try {
            await prisma.$executeRaw`
              INSERT INTO payments (
                id, import_run_id, claim_id, handler, cheque_no, payee,
                payee_vat_nr, payment_type, requested_by,
                requested_date, authorised_date, printed_date,
                gross_paid_incl_vat, gross_paid_excl_vat, net_paid_incl_vat,
                broker, policy_number, insured, claim_status,
                same_day_auth_print, self_authorised, days_request_to_print
              ) VALUES (
                gen_random_uuid(), ${importRun.id}::uuid, ${row.claimId},
                ${row.handler ?? null}, ${row.chequeNo ?? null}, ${row.payee ?? null},
                ${row.payeeVatNr ?? null}, ${row.paymentType ?? null}, ${row.requestedBy ?? null},
                ${row.requestedDate ?? null}::date, ${row.authorisedDate ?? null}::date, ${row.printedDate ?? null}::date,
                ${row.grossPaidInclVat ?? null}::decimal, ${row.grossPaidExclVat ?? null}::decimal, ${row.netPaidInclVat ?? null}::decimal,
                ${row.broker ?? null}, ${row.policyNumber ?? null}, ${row.insured ?? null}, ${row.claimStatus ?? null},
                ${row.sameDayAuthPrint}, ${row.selfAuthorised}, ${row.daysRequestToprint ?? null}::int
              )
            `;
            created++;
          } catch (rowErr) {
            errors.push({ claimId: row.claimId, error: String(rowErr) });
          }
        }
      }
    }

    // --- Update existing payments via $executeRaw ---
    let updated = 0;
    for (const { id, row } of toUpdate) {
      try {
        await prisma.$executeRaw`
          UPDATE payments SET
            import_run_id     = ${importRun.id}::uuid,
            handler           = ${row.handler ?? null},
            cheque_no         = ${row.chequeNo ?? null},
            payee             = ${row.payee ?? null},
            payee_vat_nr      = ${row.payeeVatNr ?? null},
            payment_type      = ${row.paymentType ?? null},
            requested_by      = ${row.requestedBy ?? null},
            requested_date    = ${row.requestedDate ?? null}::date,
            authorised_date   = ${row.authorisedDate ?? null}::date,
            printed_date      = ${row.printedDate ?? null}::date,
            gross_paid_incl_vat = ${row.grossPaidInclVat ?? null}::decimal,
            gross_paid_excl_vat = ${row.grossPaidExclVat ?? null}::decimal,
            net_paid_incl_vat   = ${row.netPaidInclVat ?? null}::decimal,
            broker            = ${row.broker ?? null},
            policy_number     = ${row.policyNumber ?? null},
            insured           = ${row.insured ?? null},
            claim_status      = ${row.claimStatus ?? null},
            same_day_auth_print  = ${row.sameDayAuthPrint},
            self_authorised      = ${row.selfAuthorised},
            days_request_to_print = ${row.daysRequestToprint ?? null}::int
          WHERE id = ${id}::uuid
        `;
        updated++;
      } catch (err) {
        errors.push({ claimId: row.claimId, error: String(err) });
      }
    }

    // Cross-populate notification and registration dates onto ClaimSnapshots.
    // These dates are not in the daily claims report, but the payee report has them.
    // Group by claimId — keep the earliest date per claim across all payment rows.
    const dateLookup = new Map<string, { don: Date | null; dor: Date | null }>();
    for (const row of rows) {
      const existing = dateLookup.get(row.claimId);
      const don = row.dateOfNotification ?? null;
      const dor = row.dateOfRegistration ?? null;
      if (!existing) {
        dateLookup.set(row.claimId, { don, dor });
      } else {
        if (don && (!existing.don || don < existing.don)) existing.don = don;
        if (dor && (!existing.dor || dor < existing.dor)) existing.dor = dor;
      }
    }

    for (const [claimId, dates] of dateLookup) {
      if (dates.don || dates.dor) {
        await prisma.claimSnapshot.updateMany({
          where: {
            claimId,
            OR: [
              { dateOfNotification: null },
              { dateOfRegistration: null },
            ],
          },
          data: {
            ...(dates.don ? { dateOfNotification: dates.don } : {}),
            ...(dates.dor ? { dateOfRegistration: dates.dor } : {}),
          },
        });
      }
    }

    const errored = rows.length - created - updated;

    await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        rowsCreated: created,
        rowsUpdated: updated,
        rowsErrored: errored,
        errorsJson: errors.length > 0 ? (errors as unknown as object[]) : undefined,
      },
    });

    return Response.json({
      success: true,
      importRunId: importRun.id,
      rowsRead: rows.length,
      rowsCreated: created,
      rowsUpdated: updated,
      rowsErrored: errored,
    });
  } catch (err) {
    console.error('[payee-import]', err);
    return Response.json(
      { error: 'Import failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
