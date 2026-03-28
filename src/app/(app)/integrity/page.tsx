import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { hasPermission } from '@/components/ui/sidebar-helpers';
import { IntegrityClient } from '@/components/integrity/integrity-client';

export default async function IntegrityPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx.role, 'canSeeIntegrity')) redirect('/dashboard');
  return <IntegrityClient />;
}
