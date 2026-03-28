import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { UsersClient } from '@/components/admin/users-client';

export default async function AdminUsersPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (ctx.role !== 'HEAD_OF_CLAIMS') redirect('/dashboard');
  return <UsersClient />;
}
