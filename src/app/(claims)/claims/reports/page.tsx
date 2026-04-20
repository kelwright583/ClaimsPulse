import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { ReportsClient } from '@/components/reports/reports-client';

export default async function ReportsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  return <ReportsClient role={ctx.role} userId={ctx.userId} />;
}
