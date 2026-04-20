import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { HandlerTargetsClient } from '@/components/settings/handler-targets-client';
import { hasPermission } from '@/types/roles';

export default async function HandlerTargetsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx.role, 'canConfigureSla') && !hasPermission(ctx.role, 'canManageUsers')) redirect('/settings/general');
  return <HandlerTargetsClient role={ctx.role} userId={ctx.userId} />;
}
