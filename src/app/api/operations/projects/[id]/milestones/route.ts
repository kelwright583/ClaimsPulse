export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { title, dueDate } = await req.json();
  const milestone = await prisma.projectMilestone.create({
    data: { projectId: id, title, dueDate: new Date(dueDate) },
  });
  return NextResponse.json({ milestone }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  const { milestoneId, isComplete } = await req.json();
  const milestone = await prisma.projectMilestone.update({
    where: { id: milestoneId, projectId },
    data: {
      isComplete,
      completedAt: isComplete ? new Date() : null,
    },
  });
  return NextResponse.json({ milestone });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  const { milestoneId } = await req.json();
  await prisma.projectMilestone.delete({ where: { id: milestoneId, projectId } });
  return NextResponse.json({ success: true });
}
