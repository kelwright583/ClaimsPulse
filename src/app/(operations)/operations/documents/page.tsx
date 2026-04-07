import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { redirect } from 'next/navigation';
import { DocumentLibrary } from '@/components/operations/document-library';

export default async function DocumentsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  return <DocumentLibrary role={ctx.role} />;
}
