export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { title } = await req.json();
  const max = await prisma.projectDeliverable.findFirst({
    where: { projectId: id },
    orderBy: { displayOrder: 'desc' },
    select: { displayOrder: true },
  });
  const deliverable = await prisma.projectDeliverable.create({
    data: { projectId: id, title, displayOrder: (max?.displayOrder ?? 0) + 1 },
  });
  return NextResponse.json({ deliverable }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  const { deliverableId, isComplete } = await req.json();
  const deliverable = await prisma.projectDeliverable.update({
    where: { id: deliverableId, projectId },
    data: {
      isComplete,
      completedAt: isComplete ? new Date() : null,
      completedBy: isComplete ? ctx.userId : null,
    },
  });
  return NextResponse.json({ deliverable });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  const { deliverableId } = await req.json();
  await prisma.projectDeliverable.delete({ where: { id: deliverableId, projectId } });
  return NextResponse.json({ success: true });
}
