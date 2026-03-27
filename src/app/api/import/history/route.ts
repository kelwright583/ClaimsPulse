export const dynamic = 'force-dynamic';

import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runs = await prisma.importRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      uploader: {
        select: { fullName: true, email: true },
      },
    },
  });

  return Response.json(
    runs.map(r => ({
      id: r.id,
      reportType: r.reportType,
      filename: r.filename,
      uploadedBy: r.uploadedBy,
      uploaderName: r.uploader?.fullName ?? r.uploader?.email ?? null,
      rowsRead: r.rowsRead,
      rowsCreated: r.rowsCreated,
      rowsUpdated: r.rowsUpdated,
      rowsSkipped: r.rowsSkipped,
      rowsErrored: r.rowsErrored,
      errorsJson: r.errorsJson,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      createdAt: r.createdAt,
    }))
  );
}
