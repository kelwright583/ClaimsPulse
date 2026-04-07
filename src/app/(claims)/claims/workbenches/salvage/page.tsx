import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { hasPermission } from '@/types/roles';
import { SalvageWorkbenchClient } from '@/components/workbenches/salvage-workbench-client';

export default async function SalvageWorkbenchPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx.role, 'canSeeSalvageWorkbench')) redirect('/dashboard');

  return <SalvageWorkbenchClient />;
}
