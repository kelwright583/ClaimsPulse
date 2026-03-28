import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { hasPermission } from '@/types/roles';
import { TpWorkbenchClient } from '@/components/workbenches/tp-workbench-client';

export default async function TpWorkbenchPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx.role, 'canSeeTpWorkbench')) redirect('/dashboard');

  return <TpWorkbenchClient />;
}
