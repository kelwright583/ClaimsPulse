import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { fetchPortfolioHealthData } from '@/lib/reports/portfolio-health-data';
import { generatePortfolioHealthPdf } from '@/lib/reports/portfolio-health-pdf';
import { generatePortfolioHealthXlsx } from '@/lib/reports/portfolio-health-xlsx';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dateRange, productLine, format } = await req.json();
  const data = await fetchPortfolioHealthData(dateRange ?? 'this-month', productLine);
  const isXlsx = format !== 'pdf';
  const fileBytes = isXlsx ? generatePortfolioHealthXlsx(data) : generatePortfolioHealthPdf(data);
  const filename = `portfolio-health-${data.snapshotDate}.${isXlsx ? 'xlsx' : 'pdf'}`;

  await db.generatedReport.create({
    data: {
      reportType: 'portfolio_health',
      title: `Portfolio Health — ${data.snapshotDate}`,
      parameters: { dateRange, productLine, format },
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
