import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// Whitelist of allowed fields per dataset
const ALLOWED_FIELDS: Record<string, string[]> = {
  claims: ['claimId', 'handler', 'insured', 'broker', 'claimStatus', 'totalIncurred', 'totalOs', 'cause', 'daysInCurrentStatus'],
  payments: ['claimId', 'payee', 'grossPaidInclVat', 'requestedBy', 'printedDate'],
  flags: ['claimId', 'flagType', 'severity'],
};

// Map UI field names to Prisma select keys
const FIELD_MAP: Record<string, Record<string, string>> = {
  claims: {
    claimId: 'claimId',
    handler: 'handler',
    insured: 'insured',
    broker: 'broker',
    claimStatus: 'claimStatus',
    totalIncurred: 'totalIncurred',
    totalOs: 'totalOs',
    cause: 'cause',
    daysInCurrentStatus: 'daysInCurrentStatus',
  },
  payments: {
    claimId: 'claimId',
    payee: 'payee',
    grossPaidInclVat: 'grossPaidInclVat',
    requestedBy: 'requestedBy',
    printedDate: 'printedDate',
  },
  flags: {
    claimId: 'claimId',
    flagType: 'flagType',
    severity: 'severity',
  },
};

interface Filter {
  field: string;
  operator: '=' | '!=' | '>' | '<' | 'contains';
  value: string;
}

function buildWhere(dataset: string, filters: Filter[]): Record<string, unknown> {
  const allowedFields = ALLOWED_FIELDS[dataset] ?? [];
  const where: Record<string, unknown> = {};

  for (const f of filters) {
    if (!allowedFields.includes(f.field)) continue;
    const prismaField = FIELD_MAP[dataset]?.[f.field] ?? f.field;
    switch (f.operator) {
      case '=':
        where[prismaField] = f.value;
        break;
      case '!=':
        where[prismaField] = { not: f.value };
        break;
      case '>':
        where[prismaField] = { gt: isNaN(Number(f.value)) ? f.value : Number(f.value) };
        break;
      case '<':
        where[prismaField] = { lt: isNaN(Number(f.value)) ? f.value : Number(f.value) };
        break;
      case 'contains':
        where[prismaField] = { contains: f.value, mode: 'insensitive' };
        break;
    }
  }

  return where;
}

function buildSelect(dataset: string, columns: string[]): Record<string, boolean> {
  const allowedFields = ALLOWED_FIELDS[dataset] ?? [];
  const select: Record<string, boolean> = {};
  for (const col of columns) {
    if (!allowedFields.includes(col)) continue;
    const prismaField = FIELD_MAP[dataset]?.[col] ?? col;
    select[prismaField] = true;
  }
  return select;
}

async function queryData(
  dataset: string,
  columns: string[],
  filters: Filter[],
  limit: number,
): Promise<Record<string, unknown>[]> {
  const where = buildWhere(dataset, filters);
  const select = buildSelect(dataset, columns);

  if (Object.keys(select).length === 0) return [];

  // Get latest snapshot for claims
  if (dataset === 'claims') {
    const latest = await prisma.claimSnapshot.findFirst({
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    });
    if (latest) {
      where.snapshotDate = latest.snapshotDate;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await prisma.claimSnapshot.findMany({ where, select, take: limit } as any);
    return rows.map(r => {
      const out: Record<string, unknown> = {};
      for (const col of columns) {
        const pf = FIELD_MAP.claims[col] ?? col;
        out[col] = (r as Record<string, unknown>)[pf];
      }
      return out;
    });
  }

  if (dataset === 'payments') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await prisma.payment.findMany({ where, select, take: limit, orderBy: { printedDate: 'desc' } } as any);
    return rows.map(r => {
      const out: Record<string, unknown> = {};
      for (const col of columns) {
        const pf = FIELD_MAP.payments[col] ?? col;
        out[col] = (r as Record<string, unknown>)[pf];
      }
      return out;
    });
  }

  if (dataset === 'flags') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await prisma.claimFlag.findMany({ where, select, take: limit, orderBy: { createdAt: 'desc' } } as any);
    return rows.map(r => {
      const out: Record<string, unknown> = {};
      for (const col of columns) {
        const pf = FIELD_MAP.flags[col] ?? col;
        out[col] = (r as Record<string, unknown>)[pf];
      }
      return out;
    });
  }

  return [];
}

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { dataset, columns, filters = [], dateRange, format, preview } = body;

  if (!dataset || !ALLOWED_FIELDS[dataset]) {
    return NextResponse.json({ error: 'Invalid dataset' }, { status: 400 });
  }

  const safeColumns = (columns as string[]).filter(c => ALLOWED_FIELDS[dataset]?.includes(c));
  if (safeColumns.length === 0) {
    return NextResponse.json({ error: 'No valid columns selected' }, { status: 400 });
  }

  const limit = preview ? 50 : 10000;
  const rows = await queryData(dataset, safeColumns, filters as Filter[], limit);

  if (preview) {
    return NextResponse.json({ rows, columns: safeColumns });
  }

  // Generate file
  const isXlsx = format !== 'pdf';

  let fileBytes: Uint8Array;
  let contentType: string;
  let filename: string;

  if (!isXlsx && dataset === 'claims') {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
    doc.setFillColor(13, 39, 97);
    doc.rect(0, 0, 297, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text('Custom Report — Claims', 14, 13);

    autoTable(doc, {
      startY: 26,
      head: [safeColumns],
      body: rows.map(r => safeColumns.map(c => String(r[c] ?? ''))),
      headStyles: { fillColor: [30, 91, 198] },
      styles: { fontSize: 7 },
    });

    const pageH = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(`Generated ${new Date().toLocaleDateString('en-ZA')}. ClaimsPulse.`, 14, pageH - 8);

    fileBytes = doc.output('arraybuffer') as unknown as Uint8Array;
    contentType = 'application/pdf';
    filename = `custom-report-${dataset}-${new Date().toISOString().split('T')[0]}.pdf`;
  } else if (format === 'csv') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    fileBytes = XLSX.write(wb, { type: 'buffer', bookType: 'csv' }) as Uint8Array;
    contentType = 'text/csv';
    filename = `custom-report-${dataset}-${new Date().toISOString().split('T')[0]}.csv`;
  } else {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    fileBytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    filename = `custom-report-${dataset}-${new Date().toISOString().split('T')[0]}.xlsx`;
  }

  await db.generatedReport.create({
    data: {
      reportType: 'custom',
      title: `Custom Report — ${dataset}`,
      parameters: { dataset, columns: safeColumns, filters, dateRange, format },
      format,
      generatedBy: ctx.userId,
    },
  });

  return new NextResponse(Buffer.from(fileBytes), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
