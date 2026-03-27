import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

export default async function DashboardPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#2C2C2A]">Dashboard</h1>
        <p className="text-sm text-[#5F5E5A] mt-1">
          Welcome back{ctx.fullName ? `, ${ctx.fullName.split(' ')[0]}` : ''}
        </p>
      </div>

      <div className="bg-white border border-[#D3D1C7] rounded-xl p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <div className="text-[#5F5E5A] text-sm">
          Dashboard content for <strong className="text-[#2C2C2A]">{ctx.role}</strong> role will appear here once reports are imported.
        </div>
        <div className="mt-4">
          <a
            href="/imports"
            className="inline-flex items-center gap-2 bg-[#1B3A5C] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#162f4a] transition-colors"
          >
            Import your first report
          </a>
        </div>
      </div>
    </div>
  );
}
