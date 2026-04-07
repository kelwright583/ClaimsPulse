import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { redirect } from 'next/navigation';
import { SnapshotClient } from '@/components/operations/snapshot-client';

export default async function SnapshotPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  return <SnapshotClient role={ctx.role} />;
}
