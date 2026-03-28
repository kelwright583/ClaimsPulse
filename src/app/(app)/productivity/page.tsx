import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { hasPermission } from '@/types/roles';
import { ProductivityClient } from '@/components/productivity/productivity-client';

export default async function ProductivityPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx.role, 'canSeeTeamProductivity')) {
    redirect('/dashboard');
  }

  return <ProductivityClient />;
}
