import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/types/roles';
import { recomputeImportsForward } from '@/lib/compute/recompute-forward';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(ctx.role, 'canUploadReports')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const importRun = await prisma.importRun.findUnique({ where: { id } });
  if (!importRun) return NextResponse.json({ error: 'Import not found' }, { status: 404 });

  const snapshotDate = importRun.periodStart ?? importRun.createdAt;

  // Check child counts for the confirmation modal
  const snapshotCount = await prisma.claimSnapshot.count({ where: { importRunId: id } });
  const flagCount = await prisma.claimFlag.count({ where: { importRunId: id } });
  const paymentCount = await prisma.payment.count({ where: { importRunId: id } });

  // Delete — cascade handles child rows
  await prisma.importRun.delete({ where: { id } });

  // Recompute forward if later imports exist
  const laterExists = await prisma.importRun.count({
    where: {
      reportType: 'CLAIMS_OUTSTANDING',
      periodStart: { gt: snapshotDate },
    },
  });
  if (laterExists > 0) {
    recomputeImportsForward(new Date(snapshotDate)).catch(console.error);
  }

  return NextResponse.json({
    success: true,
    deleted: { snapshotCount, flagCount, paymentCount },
  });
}
