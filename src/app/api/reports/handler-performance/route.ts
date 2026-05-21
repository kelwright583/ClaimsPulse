import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { fetchHandlerPerformanceData } from '@/lib/reports/handler-performance-data';
import { generateHandlerPerformancePdf } from '@/lib/reports/handler-performance-pdf';

export async function POST(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json() as { handler: string; toDate?: string; fromDate?: string };
    const { handler, toDate, fromDate } = body;

    if (!handler) return NextResponse.json({ error: 'handler required' }, { status: 400 });

    const data = await fetchHandlerPerformanceData(handler, toDate, fromDate);
    const pdfBytes = await generateHandlerPerformancePdf(data);

    const safeHandler = handler.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
    const dateStr = toDate ?? new Date().toISOString().split('T')[0];
    const filename = `${safeHandler}_Performance_${dateStr}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Filename': filename,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
