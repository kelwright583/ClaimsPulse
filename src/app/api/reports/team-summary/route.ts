import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { fetchTeamSummaryData } from '@/lib/reports/team-summary-data';
import { generateTeamSummaryPdf } from '@/lib/reports/team-summary-pdf';
import { generateTeamSummaryXlsx } from '@/lib/reports/team-summary-xlsx';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dateRange, format } = await req.json();
  const data = await fetchTeamSummaryData(dateRange ?? 'this-month');
  const fileBytes = format === 'pdf' ? generateTeamSummaryPdf(data) : generateTeamSummaryXlsx(data);
  const isXlsx = format !== 'pdf';
  const filename = `team-summary-${data.snapshotDate}.${isXlsx ? 'xlsx' : 'pdf'}`;

  await db.generatedReport.create({
    data: {
      reportType: 'team_summary',
      title: `Team Summary — ${data.snapshotDate}`,
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
