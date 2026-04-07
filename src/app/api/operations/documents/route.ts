export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/types/roles';

export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(ctx.role, 'canSeeProjects'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') ?? '';
  const fileType = searchParams.get('fileType') ?? '';
  const tag = searchParams.get('tag') ?? '';

  const docs = await prisma.projectDocument.findMany({
    where: {
      ...(search ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
      ...(fileType ? { fileType } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    },
    include: {
      project: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ documents: docs });
}
