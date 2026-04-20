import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { fetchBrokerPerformanceData } from '@/lib/reports/broker-performance-data';
import { generateBrokerPerformancePdf } from '@/lib/reports/broker-performance-pdf';
import { generateBrokerPerformanceXlsx } from '@/lib/reports/broker-performance-xlsx';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { broker, dateRange, format } = await req.json();
  const data = await fetchBrokerPerformanceData(dateRange ?? 'this-month', broker);
  const isXlsx = format !== 'pdf';
  const fileBytes = isXlsx ? generateBrokerPerformanceXlsx(data) : generateBrokerPerformancePdf(data);
  const filename = `broker-performance-${data.snapshotDate}.${isXlsx ? 'xlsx' : 'pdf'}`;

  await db.generatedReport.create({
    data: {
      reportType: 'broker_performance',
      title: `Broker Performance — ${data.snapshotDate}`,
      parameters: { broker, dateRange, format },
      format,
      generatedBy: ctx.userId,
    },
  });

  return new NextResponse(Buffer.from(fileBytes), {
    headers: {
      'Content-Type': isXlsx
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
