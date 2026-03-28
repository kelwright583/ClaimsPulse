import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { hasPermission } from '@/components/ui/sidebar-helpers';
import { DeltaClient } from '@/components/delta/delta-client';

export default async function DeltaPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx.role, 'canSeeAllClaims')) redirect('/dashboard');
  return <DeltaClient />;
}
