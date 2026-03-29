export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';

export async function GET() {
  const env = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    DIRECT_URL: !!process.env.DIRECT_URL,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  let db: string;
  let dbDetail: string | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = 'ok';
  } catch (err) {
    db = 'error';
    dbDetail = err instanceof Error ? err.message : String(err);
  }

  const allEnvSet = Object.values(env).every(Boolean);

  return Response.json({
    status: db === 'ok' && allEnvSet ? 'ok' : 'degraded',
    db,
    dbDetail,
    env,
  });
}
