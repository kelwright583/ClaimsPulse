import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { Sidebar } from '@/components/ui/sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  return (
    <div className="flex h-screen bg-[#F7F6F2] overflow-hidden">
      <Sidebar role={ctx.role} fullName={ctx.fullName} email={ctx.email} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
