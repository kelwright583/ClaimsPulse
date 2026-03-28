import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { ManagementDashboard } from '@/components/dashboard/management-dashboard';
import { HocDashboard } from '@/components/dashboard/hoc-dashboard';
import { TechnicianDashboard } from '@/components/dashboard/technician-dashboard';
import { TeamLeaderDashboard } from '@/components/dashboard/team-leader-dashboard';
import { TpDashboard } from '@/components/dashboard/tp-dashboard';
import { SalvageDashboard } from '@/components/dashboard/salvage-dashboard';

export default async function DashboardPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  switch (ctx.role) {
    case 'SENIOR_MANAGEMENT':
      return <ManagementDashboard />;

    case 'HEAD_OF_CLAIMS':
      return <HocDashboard />;

    case 'TEAM_LEADER':
      return <TeamLeaderDashboard />;

    case 'CLAIMS_TECHNICIAN':
      return <TechnicianDashboard />;

    case 'TP_HANDLER':
      return <TpDashboard />;

    case 'SALVAGE_HANDLER':
      return <SalvageDashboard />;

    default:
      return (
        <div>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-[#0D2761]">Dashboard</h1>
            <p className="text-sm text-[#6B7280] mt-1">
              Welcome back{ctx.fullName ? `, ${ctx.fullName.split(' ')[0]}` : ''}
            </p>
          </div>
          <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <p className="text-sm text-[#6B7280]">
              Dashboard for role <strong className="text-[#0D2761]">{ctx.role}</strong> is coming soon.
            </p>
          </div>
        </div>
      );
  }
}
