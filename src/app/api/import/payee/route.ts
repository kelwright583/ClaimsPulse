export const maxDuration = 60;
export const dynamic = 'force-dynamic';

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

    // Bulk-create new rows in chunks of 500 to stay well under the 65k parameter limit
    const CHUNK = 500;
    let created = 0;

    const buildPaymentData = (row: (typeof rows)[number]) => ({
      importRunId: importRun.id,
      claimId: row.claimId,
      handler: row.handler ?? null,
      chequeNo: row.chequeNo ?? null,
      payee: row.payee ?? null,
      payeeVatNr: row.payeeVatNr ?? null,
      paymentType: row.paymentType ?? null,
      requestedBy: row.requestedBy ?? null,
      requestedDate: row.requestedDate ?? null,
      authorisedDate: row.authorisedDate ?? null,
      printedDate: row.printedDate ?? null,
      grossPaidInclVat: row.grossPaidInclVat ?? null,
      grossPaidExclVat: row.grossPaidExclVat ?? null,
      netPaidInclVat: row.netPaidInclVat ?? null,
      broker: row.broker ?? null,
      policyNumber: row.policyNumber ?? null,
      insured: row.insured ?? null,
      claimStatus: row.claimStatus ?? null,
      sameDayAuthPrint: row.sameDayAuthPrint,
      selfAuthorised: row.selfAuthorised,
      daysRequestToprint: row.daysRequestToprint ?? null,
    });

    for (let i = 0; i < toCreate.length; i += CHUNK) {
      const chunk = toCreate.slice(i, i + CHUNK);
      try {
        const result = await prisma.payment.createMany({
          data: chunk.map(buildPaymentData),
          skipDuplicates: true,
        });
        created += result.count;
      } catch {
        for (const row of chunk) {
          try {
            await prisma.payment.create({ data: buildPaymentData(row) });
            created++;
          } catch (rowErr) {
            errors.push({ claimId: row.claimId, error: String(rowErr) });
          }
        }
      }
    }

    // Update existing rows individually (typically few)
    let updated = 0;
    for (const { id, row } of toUpdate) {
      try {
        await prisma.payment.update({
          where: { id },
          data: {
            importRunId: importRun.id,
            handler: row.handler ?? null,
            chequeNo: row.chequeNo ?? null,
            payee: row.payee ?? null,
            payeeVatNr: row.payeeVatNr ?? null,
            paymentType: row.paymentType ?? null,
            requestedBy: row.requestedBy ?? null,
            requestedDate: row.requestedDate ?? null,
            authorisedDate: row.authorisedDate ?? null,
            printedDate: row.printedDate ?? null,
            grossPaidInclVat: row.grossPaidInclVat ?? null,
            grossPaidExclVat: row.grossPaidExclVat ?? null,
            netPaidInclVat: row.netPaidInclVat ?? null,
            broker: row.broker ?? null,
            policyNumber: row.policyNumber ?? null,
            insured: row.insured ?? null,
            claimStatus: row.claimStatus ?? null,
            sameDayAuthPrint: row.sameDayAuthPrint,
            selfAuthorised: row.selfAuthorised,
            daysRequestToprint: row.daysRequestToprint ?? null,
          },
        });
        updated++;
      } catch (err) {
        errors.push({ claimId: row.claimId, error: String(err) });
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
