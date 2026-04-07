export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/types/roles';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(ctx.role, 'canSeeProjects'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? undefined;
    const priority = searchParams.get('priority') ?? undefined;

    const projects = await prisma.project.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(priority ? { priority: priority as never } : {}),
      },
      include: {
        milestones: { orderBy: { dueDate: 'asc' } },
        deliverables: { orderBy: { displayOrder: 'asc' } },
        updates: { orderBy: { createdAt: 'desc' }, take: 1 },
        documents: { select: { id: true } },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    const ownerIds = [...new Set(projects.map(p => p.ownerId))];
    const owners = await prisma.profile.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, fullName: true, email: true },
    });
    const ownerMap = Object.fromEntries(owners.map(o => [o.id, o.fullName ?? o.email]));

    const result = projects.map(p => ({
      ...p,
      ownerName: ownerMap[p.ownerId] ?? 'Unknown',
      documentCount: p.documents.length,
      completedDeliverables: p.deliverables.filter(d => d.isComplete).length,
      totalDeliverables: p.deliverables.length,
      completedMilestones: p.milestones.filter(m => m.isComplete).length,
      totalMilestones: p.milestones.length,
      nextMilestone: p.milestones.find(m => !m.isComplete) ?? null,
      lastUpdate: p.updates[0] ?? null,
    }));

    return NextResponse.json({ projects: result });
  } catch (err) {
    console.error('[operations/projects GET]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(ctx.role, 'canCreateProjects'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { title, description, priority, pillarLink, metricLink, startDate, dueDate, ownerId } = body;

    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

    const project = await prisma.project.create({
      data: {
        title: title.trim(),
        description: description?.trim() ?? null,
        priority: priority ?? 'MEDIUM',
        pillarLink: pillarLink ?? null,
        metricLink: metricLink ?? null,
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        ownerId: ownerId ?? ctx.userId,
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error('[operations/projects POST]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
