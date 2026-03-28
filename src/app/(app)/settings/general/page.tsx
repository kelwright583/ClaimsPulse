import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { GeneralSettingsClient } from '@/components/settings/general-settings-client';

export default async function GeneralSettingsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (ctx.role !== 'HEAD_OF_CLAIMS') redirect('/dashboard');
  return <GeneralSettingsClient />;
}
