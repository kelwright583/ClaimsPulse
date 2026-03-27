'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { hasPermission, ROLE_LABELS, getInitials } from './sidebar-helpers';
import type { UserRole } from '@/types/roles';

interface SidebarProps {
  role: UserRole;
  fullName?: string | null;
  email: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  permission?: keyof ReturnType<typeof getNavPermissions>;
}

function getNavPermissions(role: UserRole) {
  return {
    canSeeFinancials: hasPermission(role, 'canSeeFinancials'),
    canSeeAllClaims: hasPermission(role, 'canSeeAllClaims'),
    canSeeTeamProductivity: hasPermission(role, 'canSeeTeamProductivity'),
    canConfigureSla: hasPermission(role, 'canConfigureSla'),
    canSeeIntegrity: hasPermission(role, 'canSeeIntegrity'),
    canSeeTpWorkbench: hasPermission(role, 'canSeeTpWorkbench'),
    canSeeSalvageWorkbench: hasPermission(role, 'canSeeSalvageWorkbench'),
    canUploadReports: hasPermission(role, 'canUploadReports'),
    canManageUsers: hasPermission(role, 'canManageUsers'),
  };
}

export function Sidebar({ role, fullName, email }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const perms = getNavPermissions(role);

  async function handleSignOut() {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const navItems = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: <DashboardIcon />,
      show: true,
    },
    {
      label: 'Claims',
      href: '/claims',
      icon: <ClaimsIcon />,
      show: perms.canSeeAllClaims || role === 'CLAIMS_TECHNICIAN',
    },
    {
      label: 'SLA Watchlist',
      href: '/sla',
      icon: <SlaIcon />,
      show: true,
    },
    {
      label: 'Delta',
      href: '/delta',
      icon: <DeltaIcon />,
      show: perms.canSeeAllClaims,
    },
    {
      label: 'Productivity',
      href: '/productivity',
      icon: <ProductivityIcon />,
      show: perms.canSeeTeamProductivity,
    },
    {
      label: 'Financial',
      href: '/financial',
      icon: <FinancialIcon />,
      show: perms.canSeeFinancials,
    },
    {
      label: 'Integrity',
      href: '/integrity',
      icon: <IntegrityIcon />,
      show: perms.canSeeIntegrity,
    },
    {
      label: 'TP Workbench',
      href: '/workbenches/tp',
      icon: <WorkbenchIcon />,
      show: perms.canSeeTpWorkbench,
    },
    {
      label: 'Salvage',
      href: '/workbenches/salvage',
      icon: <WorkbenchIcon />,
      show: perms.canSeeSalvageWorkbench,
    },
    {
      label: 'Import Reports',
      href: '/imports',
      icon: <ImportIcon />,
      show: perms.canUploadReports,
    },
  ].filter((item) => item.show);

  const settingsItems = [
    {
      label: 'SLA Matrix',
      href: '/settings/sla-matrix',
      show: perms.canConfigureSla,
    },
    {
      label: 'Users',
      href: '/admin/users',
      show: perms.canManageUsers,
    },
  ].filter((item) => item.show);

  return (
    <aside className="w-60 flex-shrink-0 bg-[#1B3A5C] flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <span className="text-white font-bold text-xs">CP</span>
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">ClaimsPulse</div>
            <div className="text-white/50 text-xs">Santam / SEB</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-white/70 hover:bg-white/8 hover:text-white'
              }`}
            >
              <span className="flex-shrink-0 w-4 h-4">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        {settingsItems.length > 0 && (
          <>
            <div className="pt-4 pb-1 px-3">
              <span className="text-white/40 text-xs font-medium uppercase tracking-wider">Settings</span>
            </div>
            {settingsItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? 'bg-white/15 text-white font-medium'
                      : 'text-white/70 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-[#0F6E56] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-semibold">
              {getInitials(fullName ?? email)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs font-medium truncate">{fullName ?? email}</div>
            <div className="text-white/50 text-xs">{ROLE_LABELS[role]}</div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full mt-2 px-3 py-2 text-left text-white/60 hover:text-white text-xs rounded-lg hover:bg-white/8 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function DashboardIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

function ClaimsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <path d="M5 6h6M5 9h4" />
    </svg>
  );
}

function SlaIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5v4l2.5 1.5" />
    </svg>
  );
}

function DeltaIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2L14 13H2L8 2z" />
    </svg>
  );
}

function ProductivityIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12l4-4 3 3 5-7" />
    </svg>
  );
}

function FinancialIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
      <circle cx="8" cy="8" r="4" />
      <path d="M6.5 9.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5S9.5 7 8.5 7C7.67 7 7 6.33 7 5.5S7.67 4 8.5 4 10 4.67 10 5.5" />
    </svg>
  );
}

function IntegrityIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2L3 4.5v4C3 11 5.5 13.5 8 14c2.5-.5 5-3 5-5.5v-4L8 2z" />
      <path d="M5.5 8l1.5 1.5 3-3" />
    </svg>
  );
}

function WorkbenchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="4" width="14" height="9" rx="1" />
      <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
      <path d="M8 7v4M6 9h4" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2v8M5 7l3 3 3-3" />
      <path d="M2 12h12" />
    </svg>
  );
}
