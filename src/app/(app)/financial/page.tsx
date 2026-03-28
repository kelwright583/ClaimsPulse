import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { hasPermission } from '@/components/ui/sidebar-helpers';
import { FinancialClient } from '@/components/financial/financial-client';

export default async function FinancialPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx.role, 'canSeeFinancials')) redirect('/dashboard');

  return <FinancialClient />;
}
