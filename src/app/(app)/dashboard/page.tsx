import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

export default async function DashboardPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  return (
    <DashboardClient
      role={ctx.role}
      userId={ctx.userId}
      fullName={ctx.fullName ?? null}
    />
  );
}
