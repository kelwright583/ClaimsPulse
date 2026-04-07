import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { PillarSidebar } from '@/components/layout/pillar-sidebar';
import { ToastProvider } from '@/components/ui/toast';
import { PageTransition } from '@/components/ui/page-transition';

export default async function UnderwritingLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  return (
    <ToastProvider>
      <div className="flex bg-white">
        <PillarSidebar pillar="underwriting" role={ctx.role} fullName={ctx.fullName} email={ctx.email} />
        <main className="main-scroll flex-1 overflow-y-auto min-h-screen pt-14 lg:pt-0">
          <div className="p-6 max-w-[1600px] mx-auto">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
