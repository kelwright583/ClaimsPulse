import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { fetchDailyHandlerReportData } from '@/lib/reports/daily-handler-data';
import { generateDailyHandlerPdf } from '@/lib/reports/daily-handler-pdf';
import { generateDailyHandlerXlsx } from '@/lib/reports/daily-handler-xlsx';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { handler, format } = await req.json();
  if (!handler || !format) return NextResponse.json({ error: 'handler and format required' }, { status: 400 });

  const data = await fetchDailyHandlerReportData(handler);

  let fileBytes: Uint8Array;
  let contentType: string;
  let filename: string;

  if (format === 'pdf') {
    fileBytes = generateDailyHandlerPdf(data);
    contentType = 'application/pdf';
    filename = `daily-handler-${handler.replace(/\s+/g, '-')}-${data.snapshotDate}.pdf`;
  } else {
    fileBytes = generateDailyHandlerXlsx(data);
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    filename = `daily-handler-${handler.replace(/\s+/g, '-')}-${data.snapshotDate}.xlsx`;
  }

  await db.generatedReport.create({
    data: {
      reportType: 'daily_handler',
      title: `Daily Handler — ${handler}`,
      parameters: { handler, format },
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
