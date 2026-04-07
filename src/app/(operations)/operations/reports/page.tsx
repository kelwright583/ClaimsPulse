import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { redirect } from 'next/navigation';
import { ReportsCatalogue } from '@/components/operations/reports-catalogue';

export default async function ReportsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  return <ReportsCatalogue role={ctx.role} />;
}
