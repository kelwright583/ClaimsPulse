import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { SlaMatrixClient } from '@/components/settings/sla-matrix-client';

export default async function SlaMatrixPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (ctx.role !== 'HEAD_OF_CLAIMS') redirect('/dashboard');

  return <SlaMatrixClient />;
}
