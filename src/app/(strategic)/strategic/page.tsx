import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { StrategicDashboard } from '@/components/dashboard/strategic/strategic-dashboard';

export default async function StrategicPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  return <StrategicDashboard role={ctx.role} userId={ctx.userId} />;
}
