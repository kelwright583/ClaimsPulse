'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutGrid, FileText, Clock, ArrowLeftRight, TrendingUp,
  BarChart3, ShieldAlert, Users, RefreshCw, Upload,
  Settings, UserCog, LogOut, Menu, ChevronLeft,
  Mail, AlarmClock, ScrollText, Settings2, Building2, Telescope,
  Sun, FolderKanban, Library, FileDown, Briefcase,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { hasPermission, ROLE_LABELS, getInitials } from '@/components/ui/sidebar-helpers';
import type { UserRole } from '@/types/roles';

export type PillarKey = 'claims' | 'mailbox' | 'underwriting' | 'finance' | 'operations' | 'strategic' | 'settings';

interface NavItem {
  label: string;
  href: string;
  Icon: LucideIcon;
  show: boolean;
}

interface PillarSidebarProps {
  pillar: PillarKey;
  role: UserRole;
  fullName?: string | null;
  email: string;
}

function getPillarNav(pillar: PillarKey, role: UserRole): NavItem[] {
  const p = {
    canSeeAllClaims:        hasPermission(role, 'canSeeAllClaims'),
    canSeeTeamProductivity: hasPermission(role, 'canSeeTeamProductivity'),
    canSeeIntegrity:        hasPermission(role, 'canSeeIntegrity'),
    canSeeTpWorkbench:      hasPermission(role, 'canSeeTpWorkbench'),
    canSeeSalvageWorkbench: hasPermission(role, 'canSeeSalvageWorkbench'),
    canConfigureMailbox:    hasPermission(role, 'canConfigureMailbox'),
    canConfigureSla:        hasPermission(role, 'canConfigureSla'),
    canUploadReports:       hasPermission(role, 'canUploadReports'),
    canManageUsers:         hasPermission(role, 'canManageUsers'),
    canSeeProjects:         hasPermission(role, 'canSeeProjects'),
  };

  switch (pillar) {
    case 'claims':
      return [
        { label: 'Overview',      href: '/claims',                       Icon: LayoutGrid,   show: true },
        { label: 'Register',      href: '/claims/register',              Icon: FileText,     show: p.canSeeAllClaims || role === 'CLAIMS_TECHNICIAN' },
        { label: 'SLA Watchlist', href: '/claims/sla',                   Icon: Clock,        show: true },
        { label: 'Delta',         href: '/claims/delta',                 Icon: ArrowLeftRight, show: p.canSeeAllClaims },
        { label: 'Productivity',  href: '/claims/productivity',          Icon: TrendingUp,   show: p.canSeeTeamProductivity },
        { label: 'Integrity',     href: '/claims/integrity',             Icon: ShieldAlert,  show: p.canSeeIntegrity },
        { label: 'TP Workbench',  href: '/claims/workbenches/tp',        Icon: Users,        show: p.canSeeTpWorkbench },
        { label: 'Salvage',       href: '/claims/workbenches/salvage',   Icon: RefreshCw,    show: p.canSeeSalvageWorkbench },
      ];
    case 'mailbox':
      return [
        { label: 'Inbox Routing', href: '/mailbox',        Icon: Mail,       show: true },
        { label: 'TAT Monitor',   href: '/mailbox/tat',    Icon: AlarmClock, show: true },
        { label: 'Audit Log',     href: '/mailbox/audit',  Icon: ScrollText, show: true },
        { label: 'Setup',         href: '/mailbox/setup',  Icon: Settings2,  show: p.canConfigureMailbox },
      ];
    case 'underwriting':
      return [
        { label: 'Production',    href: '/underwriting',          Icon: Building2, show: true },
        { label: 'Broker Health', href: '/underwriting/brokers',  Icon: BarChart3, show: true },
      ];
    case 'finance':
      return [
        { label: 'Financial',     href: '/finance', Icon: BarChart3, show: true },
      ];
    case 'operations':
      return [
        { label: 'Overview',       href: '/operations',           Icon: LayoutGrid,   show: true },
        { label: 'Daily Snapshot', href: '/operations/snapshot',  Icon: Sun,          show: true },
        { label: 'Projects',       href: '/operations/projects',  Icon: FolderKanban, show: p.canSeeProjects },
        { label: 'Documents',      href: '/operations/documents', Icon: Library,      show: p.canSeeProjects },
        { label: 'Reports',        href: '/operations/reports',   Icon: FileDown,     show: true },
      ];
    case 'strategic':
      return [
        { label: 'Strategic Overview', href: '/strategic', Icon: Telescope, show: true },
      ];
    case 'settings':
      return [
        { label: 'General',        href: '/settings/general',    Icon: Settings,  show: true },
        { label: 'SLA Matrix',     href: '/settings/sla-matrix', Icon: Clock,     show: p.canConfigureSla },
        { label: 'Targets',        href: '/settings/targets',    Icon: TrendingUp, show: p.canConfigureSla },
        { label: 'Import Reports', href: '/imports',             Icon: Upload,    show: p.canUploadReports },
        { label: 'Users',          href: '/admin/users',         Icon: UserCog,   show: p.canManageUsers },
      ];
    default:
      return [];
  }
}

const PILLAR_LABELS: Record<PillarKey, string> = {
  claims:       'Claims',
  mailbox:      'Mailbox',
  underwriting: 'Underwriting',
  finance:      'Finance',
  operations:   'Operations',
  strategic:    'Strategic',
  settings:     'Settings',
};

export function PillarSidebar({ pillar, role, fullName, email }: PillarSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = getPillarNav(pillar, role).filter(i => i.show);

  async function handleSignOut() {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Back to hub */}
      <div className="flex items-center px-4 py-3 border-b border-[#E8EEF8] flex-shrink-0">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs font-medium text-[#6B7280] hover:text-[#0D2761] transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
          SEB Hub
        </Link>
      </div>

      {/* Logo + pillar name */}
      <div className="px-5 py-4 border-b border-[#E8EEF8] flex-shrink-0">
        <img src="/logo.svg" alt="SEB Hub" className="h-8 w-auto mb-3" />
        <span className="text-[9px] font-semibold uppercase tracking-widest text-[#6B7280] opacity-60">
          {PILLAR_LABELS[pillar]}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 sidebar-nav-hide-scrollbar">
        {navItems.map(item => {
          const active = pathname === item.href || (item.href !== '/claims' && item.href !== '/operations' && item.href !== '/mailbox' && item.href !== '/underwriting' && item.href !== '/finance' && item.href !== '/strategic' && pathname.startsWith(item.href + '/'));
          return (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              Icon={item.Icon}
              active={active}
              onClick={() => setMobileOpen(false)}
            />
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-[#E8EEF8] p-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-[#0D2761] flex items-center justify-center flex-shrink-0">
            <span className="text-[#F5A800] text-[10px] font-bold">
              {getInitials(fullName ?? email)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#0D2761] truncate">
              {fullName ?? email}
            </div>
            <div className="text-[10px] text-[#6B7280] truncate">
              {ROLE_LABELS[role]}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-[#6B7280] hover:text-[#0D2761] transition-colors flex-shrink-0"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[220px] flex-shrink-0 bg-white border-r border-[#E8EEF8] flex-col h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 border-b border-[#E8EEF8] bg-white px-4 py-3 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="text-[#0D2761]"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" strokeWidth={2} />
        </button>
        <img src="/logo.svg" alt="SEB Hub" className="h-7 w-auto" />
        <span className="text-sm font-semibold text-[#0D2761]">{PILLAR_LABELS[pillar]}</span>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 h-screen w-[260px] bg-white border-r border-[#E8EEF8] flex flex-col">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

function NavItem({ href, label, Icon, active, onClick }: {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`
        relative flex items-center gap-3 py-2 text-sm font-medium
        transition-colors duration-150 rounded-r-md mx-0
        ${active ? 'text-white' : 'text-[#6B7280] hover:text-[#0D2761] hover:bg-[#F4F6FA]'}
      `}
      style={{
        paddingLeft: '16px',
        paddingRight: '12px',
        backgroundColor: active ? '#1E5BC6' : undefined,
        borderLeft: active ? '3px solid #F5A800' : '3px solid transparent',
        marginLeft: '-1px',
      }}
    >
      <Icon className={`flex-shrink-0 w-4 h-4 ${active ? 'opacity-100' : 'opacity-60'}`} strokeWidth={2} />
      {label}
    </Link>
  );
}
