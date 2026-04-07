export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: projectId } = await params;
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = (formData.get('title') as string) || file?.name || 'Untitled';
    const description = (formData.get('description') as string) || null;
    const tagsRaw = (formData.get('tags') as string) || '';
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const supabase = await createClient();
    const ext = file.name.split('.').pop() ?? 'bin';
    const path = `${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('project-documents')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('project-documents')
      .getPublicUrl(path);

    const doc = await prisma.projectDocument.create({
      data: {
        projectId,
        title,
        description,
        fileUrl: publicUrl,
        fileType: ext,
        fileSizeKb: Math.round(file.size / 1024),
        tags,
        uploadedBy: ctx.userId,
      },
    });

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (err) {
    console.error('[documents POST]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  const { documentId } = await req.json();
  await prisma.projectDocument.delete({ where: { id: documentId, projectId } });
  return NextResponse.json({ success: true });
}
