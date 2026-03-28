import { NextRequest } from 'next/server';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const SETTINGS_PATH = path.join(process.cwd(), 'src', 'data', 'settings.json');

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeSettings(data: Record<string, unknown>) {
  await mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET() {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const settings = await readSettings();
    return Response.json({ settings });
  } catch {
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (ctx.role !== 'HEAD_OF_CLAIMS') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const current = await readSettings();
    const updated = { ...current, ...body };
    await writeSettings(updated);
    return Response.json({ settings: updated });
  } catch {
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
