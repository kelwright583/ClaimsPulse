import { createClient } from './server';
import { prisma } from '@/lib/prisma';
import type { UserRole } from '@/types/roles';

export interface SessionContext {
  userId: string;
  email: string;
  role: UserRole;
  fullName?: string | null;
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) return null;

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, role: true, fullName: true },
  });

  if (!profile) return null;

  return {
    userId: profile.id,
    email: profile.email,
    role: profile.role as UserRole,
    fullName: profile.fullName,
  };
}

export async function requireAuth(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw new Error('Unauthorized');
  return ctx;
}
