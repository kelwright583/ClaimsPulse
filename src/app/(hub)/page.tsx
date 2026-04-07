import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import Link from 'next/link';
import { hasPermission } from '@/types/roles';

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

// Phase 1 placeholder — full tile UI built in Phase 2
export default async function HubPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const role = ctx.role;

  const pillars = [
    {
      key: 'claims',
      label: 'Claims',
      description: 'SLA watchlist, handler performance, workbenches',
      href: '/claims',
      show: ['HEAD_OF_CLAIMS', 'TEAM_LEADER', 'CLAIMS_TECHNICIAN', 'TP_HANDLER', 'SALVAGE_HANDLER'].includes(role),
    },
    {
      key: 'mailbox',
      label: 'Mailbox',
      description: 'Email routing, TAT monitoring, AI classification',
      href: '/mailbox',
      show: hasPermission(role, 'canSeeMailbox'),
    },
    {
      key: 'underwriting',
      label: 'Underwriting',
      description: 'Production vs target, broker health, portfolio',
      href: '/underwriting',
      show: hasPermission(role, 'canSeeUnderwriting'),
    },
    {
      key: 'finance',
      label: 'Finance',
      description: 'Loss ratio, U/W result, reserves, scenario modeller',
      href: '/finance',
      show: hasPermission(role, 'canSeeFinancials'),
    },
    {
      key: 'operations',
      label: 'Operations',
      description: 'Projects, daily snapshot, reports, documents',
      href: '/operations',
      show: hasPermission(role, 'canSeeProjects') || role === 'HEAD_OF_CLAIMS',
    },
    {
      key: 'strategic',
      label: 'Strategic Overview',
      description: 'Executive KPIs, targets, business case view',
      href: '/strategic',
      show: hasPermission(role, 'canSeeStrategic'),
    },
    {
      key: 'settings',
      label: 'Settings & Imports',
      description: 'Import reports, SLA matrix, targets, user management',
      href: '/settings',
      show: hasPermission(role, 'canConfigureSla') || hasPermission(role, 'canUploadReports') || hasPermission(role, 'canManageUsers'),
    },
  ].filter(p => p.show);

  const firstName = ctx.fullName?.split(' ')[0] ?? 'there';
  const dateStr = new Date().toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#F4F6FA]">
      {/* Header */}
      <header className="bg-white border-b border-[#E8EEF8] px-8 py-4 flex items-center justify-between">
        <img src="/logo.svg" alt="SEB Hub" className="h-10 w-auto" />
        <div className="text-sm text-[#6B7280]">
          <span className="font-medium text-[#0D2761]">{ctx.fullName ?? ctx.email}</span>
        </div>
      </header>

      {/* Tiles */}
      <div className="max-w-5xl mx-auto px-8 py-12">
        <h1 className="text-2xl font-bold text-[#0D2761] mb-2">
          Good {getTimeOfDay()}, {firstName}
        </h1>
        <p className="text-sm text-[#6B7280] mb-8">{dateStr}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pillars.map(p => (
            <Link
              key={p.key}
              href={p.href}
              className="bg-white border border-[#E8EEF8] rounded-xl p-6 hover:border-[#1E5BC6] hover:shadow-sm transition-all duration-150 cursor-pointer"
            >
              <h2 className="text-base font-bold text-[#0D2761] mb-1">{p.label}</h2>
              <p className="text-xs text-[#6B7280] leading-relaxed">{p.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
