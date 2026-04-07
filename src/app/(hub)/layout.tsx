import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { ToastProvider } from '@/components/ui/toast';

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  );
}
