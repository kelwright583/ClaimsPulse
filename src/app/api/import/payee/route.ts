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

    // Create ImportRun record
    const importRun = await prisma.importRun.create({
      data: {
        reportType: 'PAYEE',
        filename: file.name,
        uploadedBy: ctx.userId,
        rowsRead: rows.length,
      },
    });

    // Insert payments in chunks of 500
    const CHUNK = 500;
    let created = 0;
    let updated = 0;
    let errored = 0;
    const errors: Array<{ claimId: string; error: string }> = [];

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      for (const row of chunk) {
        try {
          // Check for existing payment by claimId + chequeNo (if chequeNo present)
          let existing = null;
          if (row.chequeNo) {
            existing = await prisma.payment.findFirst({
              where: { claimId: row.claimId, chequeNo: row.chequeNo },
              select: { id: true },
            });
          }

          const data = {
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
          };

          if (existing) {
            await prisma.payment.update({ where: { id: existing.id }, data });
            updated++;
          } else {
            await prisma.payment.create({ data });
            created++;
          }
        } catch (err) {
          errored++;
          errors.push({ claimId: row.claimId, error: String(err) });
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
