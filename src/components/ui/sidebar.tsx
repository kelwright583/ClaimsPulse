'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutGrid, FileText, Clock, ArrowLeftRight, TrendingUp,
  BarChart3, ShieldAlert, Users, RefreshCw, Upload,
  Settings, UserCog, Sliders, LogOut, Menu,
} from 'lucide-react';
import { hasPermission, ROLE_LABELS, getInitials } from './sidebar-helpers';
import type { UserRole } from '@/types/roles';

interface SidebarProps {
  role: UserRole;
  fullName?: string | null;
  email: string;
}

function getNavPermissions(role: UserRole) {
  return {
    canSeeFinancials:       hasPermission(role, 'canSeeFinancials'),
    canSeeAllClaims:        hasPermission(role, 'canSeeAllClaims'),
    canSeeTeamProductivity: hasPermission(role, 'canSeeTeamProductivity'),
    canConfigureSla:        hasPermission(role, 'canConfigureSla'),
    canSeeIntegrity:        hasPermission(role, 'canSeeIntegrity'),
    canSeeTpWorkbench:      hasPermission(role, 'canSeeTpWorkbench'),
    canSeeSalvageWorkbench: hasPermission(role, 'canSeeSalvageWorkbench'),
    canUploadReports:       hasPermission(role, 'canUploadReports'),
    canManageUsers:         hasPermission(role, 'canManageUsers'),
  };
}

export function Sidebar({ role, fullName, email }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const perms = getNavPermissions(role);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const navItems = [
    { label: 'Dashboard',     href: '/dashboard',          Icon: LayoutGrid,     show: true },
    { label: 'Claims',        href: '/claims',             Icon: FileText,       show: perms.canSeeAllClaims || role === 'CLAIMS_TECHNICIAN' },
    { label: 'SLA Watchlist', href: '/sla',                Icon: Clock,          show: true },
    { label: 'Delta',         href: '/delta',              Icon: ArrowLeftRight,  show: perms.canSeeAllClaims },
    { label: 'Productivity',  href: '/productivity',       Icon: TrendingUp,     show: perms.canSeeTeamProductivity },
    { label: 'Financial',     href: '/financial',          Icon: BarChart3,      show: perms.canSeeFinancials },
    { label: 'Integrity',     href: '/integrity',          Icon: ShieldAlert,    show: perms.canSeeIntegrity },
    { label: 'TP Workbench',  href: '/workbenches/tp',     Icon: Users,          show: perms.canSeeTpWorkbench },
    { label: 'Salvage',       href: '/workbenches/salvage', Icon: RefreshCw,     show: perms.canSeeSalvageWorkbench },
    { label: 'Import Reports',href: '/imports',            Icon: Upload,         show: perms.canUploadReports },
  ].filter(item => item.show);

  const settingsItems = [
    { label: 'General',    href: '/settings/general',  Icon: Settings,  show: perms.canConfigureSla },
    { label: 'SLA Matrix', href: '/settings/sla-matrix', Icon: Sliders, show: perms.canConfigureSla },
    { label: 'Targets',    href: '/settings/targets',  Icon: TrendingUp, show: hasPermission(role, 'canSeeFinancials') },
    { label: 'Users',      href: '/admin/users',        Icon: UserCog,   show: perms.canManageUsers },
  ].filter(item => item.show);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-center px-5 py-4 border-b border-[#E8EEF8] flex-shrink-0">
        <img
          src="/logo.svg"
          alt="ClaimsPulse — Santam Emerging Business"
          className="h-12 w-auto"
        />
      </div>

      {/* Nav */}
      <nav className="sidebar-nav flex-1 overflow-y-auto py-3 space-y-0.5">
        {navItems.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
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

        {settingsItems.length > 0 && (
          <>
            <div className="px-4 pt-4 pb-1">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-[#6B7280] opacity-60">
                Settings
              </span>
            </div>
            {settingsItems.map(item => {
              const active = pathname === item.href;
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
          </>
        )}
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
        <img src="/logo.svg" alt="ClaimsPulse" className="h-7 w-auto" />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 h-screen w-[260px] bg-white border-r border-[#E8EEF8] flex flex-col">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

// ── Nav item ──────────────────────────────────────────────────────

import type { LucideIcon } from 'lucide-react';

function NavItem({
  href,
  label,
  Icon,
  active,
  onClick,
}: {
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
        ${active
          ? 'text-white'
          : 'text-[#6B7280] hover:text-[#0D2761] hover:bg-[#F4F6FA]'
        }
      `}
      style={{
        paddingLeft: '16px',
        paddingRight: '12px',
        backgroundColor: active ? '#1E5BC6' : undefined,
        borderLeft: active ? '3px solid #F5A800' : '3px solid transparent',
        marginLeft: '-1px',
      }}
    >
      <Icon
        className={`flex-shrink-0 w-4 h-4 ${active ? 'opacity-100' : 'opacity-60'}`}
        strokeWidth={2}
      />
      {label}
    </Link>
  );
}

