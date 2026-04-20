import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { fetchTatComplianceData } from '@/lib/reports/tat-compliance-data';
import { generateTatCompliancePdf } from '@/lib/reports/tat-compliance-pdf';
import { generateTatComplianceXlsx } from '@/lib/reports/tat-compliance-xlsx';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dateRange, format } = await req.json();
  const data = await fetchTatComplianceData(dateRange ?? 'this-month');
  const isXlsx = format !== 'pdf';
  const fileBytes = isXlsx ? generateTatComplianceXlsx(data) : generateTatCompliancePdf(data);
  const filename = `tat-compliance-${data.snapshotDate}.${isXlsx ? 'xlsx' : 'pdf'}`;

  await db.generatedReport.create({
    data: {
      reportType: 'tat_compliance',
      title: `TAT Compliance — ${data.snapshotDate}`,
      parameters: { dateRange, format },
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
