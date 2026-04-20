import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { TatMatrixClient } from '@/components/settings/tat-matrix-client';

export default async function TatMatrixPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (ctx.role !== 'HEAD_OF_CLAIMS') redirect('/dashboard');

  return <TatMatrixClient />;
}
