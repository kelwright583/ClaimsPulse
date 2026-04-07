import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { redirect } from 'next/navigation';
import { hasPermission } from '@/types/roles';
import { ProjectList } from '@/components/operations/project-list';

export default async function ProjectsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx.role, 'canSeeProjects')) redirect('/operations');
  return <ProjectList role={ctx.role} userId={ctx.userId} />;
}
