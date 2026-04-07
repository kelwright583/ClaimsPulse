import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { redirect } from 'next/navigation';
import { ProjectDetail } from '@/components/operations/project-detail';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  return <ProjectDetail id={id} role={ctx.role} userId={ctx.userId} />;
}
