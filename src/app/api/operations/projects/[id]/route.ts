export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/types/roles';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(ctx.role, 'canSeeProjects'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        milestones: { orderBy: { dueDate: 'asc' } },
        deliverables: { orderBy: { displayOrder: 'asc' } },
        updates: { orderBy: { createdAt: 'desc' } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const owner = await prisma.profile.findUnique({
      where: { id: project.ownerId },
      select: { fullName: true, email: true },
    });

    const authorIds = [...new Set(project.updates.map(u => u.authorId))];
    const authors = await prisma.profile.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, fullName: true, email: true },
    });
    const authorMap = Object.fromEntries(authors.map(a => [a.id, a.fullName ?? a.email]));

    let liveMetric: { label: string; value: string; target?: string } | null = null;
    if (project.metricLink) {
      liveMetric = await resolveMetric(project.metricLink);
    }

    return NextResponse.json({
      project: {
        ...project,
        ownerName: owner?.fullName ?? owner?.email ?? 'Unknown',
        updates: project.updates.map(u => ({
          ...u,
          authorName: authorMap[u.authorId] ?? 'Unknown',
        })),
        liveMetric,
      },
    });
  } catch (err) {
    console.error('[operations/projects/[id] GET]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function resolveMetric(metricLink: string): Promise<{ label: string; value: string; target?: string } | null> {
  try {
    const latest = await prisma.claimSnapshot.findFirst({
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    });
    if (!latest) return null;

    switch (metricLink) {
      case 'sla_breach_count': {
        const count = await prisma.claimSnapshot.count({
          where: { snapshotDate: latest.snapshotDate, isTatBreach: true },
        });
        return { label: 'TAT breaches (open)', value: String(count), target: '0' };
      }
      case 'open_claims_count': {
        const count = await prisma.claimSnapshot.count({
          where: {
            snapshotDate: latest.snapshotDate,
            claimStatus: { notIn: ['Finalised', 'Cancelled', 'Repudiated'] },
          },
        });
        return { label: 'Open claims', value: String(count) };
      }
      case 'loss_ratio': {
        const latestPremium = await prisma.premiumRecord.findFirst({
          orderBy: { periodDate: 'desc' },
          select: { periodDate: true },
        });
        if (!latestPremium) return null;
        const [totalIncurred, totalPremium] = await Promise.all([
          prisma.claimSnapshot.aggregate({
            where: { snapshotDate: latest.snapshotDate },
            _sum: { totalIncurred: true },
          }),
          prisma.premiumRecord.aggregate({
            where: {
              periodDate: latestPremium.periodDate,
              endorsementType: { in: ['Renewal', 'New Business'] },
            },
            _sum: { netWp: true },
          }),
        ]);
        const incurred = Number(totalIncurred._sum.totalIncurred ?? 0);
        const premium = Number(totalPremium._sum.netWp ?? 0);
        const lr = premium > 0 ? ((incurred / premium) * 100).toFixed(1) : 'N/A';
        return { label: 'Net loss ratio (MTD)', value: `${lr}%`, target: '65%' };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(ctx.role, 'canSeeProjects'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const body = await req.json();

    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.ownerId !== undefined ? { ownerId: body.ownerId } : {}),
        ...(body.pillarLink !== undefined ? { pillarLink: body.pillarLink } : {}),
        ...(body.metricLink !== undefined ? { metricLink: body.metricLink } : {}),
        ...(body.startDate !== undefined ? { startDate: body.startDate ? new Date(body.startDate) : null } : {}),
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(body.dueDate) : null } : {}),
        ...(body.status === 'COMPLETE' ? { completedAt: new Date() } : {}),
      },
    });
    return NextResponse.json({ project: updated });
  } catch (err) {
    console.error('[operations/projects/[id] PATCH]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(ctx.role, 'canDeleteProjects'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[operations/projects/[id] DELETE]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
