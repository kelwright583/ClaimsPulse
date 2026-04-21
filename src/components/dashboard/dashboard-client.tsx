'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { UserRole } from '@/types/roles';
import type { TopView, FilterState } from './types';
import { DEFAULT_VIEW, DEFAULT_FILTERS, SUB_VIEWS, TOP_VIEWS } from './types';
import { ViewSwitcher } from './view-switcher';
import { SubViewSwitcher } from './sub-view-switcher';
import { FilterBar } from './filter-bar';

// Sub-view components — management overview
import { ManagementOverviewClient } from './management-overview/management-overview-client';

// Sub-view components — claims
import { MorningBrief } from './claims/morning-brief';
import { PortfolioHealth } from './claims/portfolio-health';
import { HandlerPerformance } from './claims/handler-performance';
import { BrokerLens } from './claims/broker-lens';
import { GeographicPeril } from './claims/geographic-peril';
import { ActionsRequired } from './claims/actions-required';

// Sub-view components — my-work
import ActionList from './my-work/action-list';
import MyPortfolio from './my-work/my-portfolio';
import ProductivityScores from './my-work/productivity-scores';
import CsTatHealth from './my-work/cs-tat-health';

interface DashboardClientProps {
  role: UserRole;
  userId: string;
  fullName: string | null;
}

export function DashboardClient({ role, userId, fullName }: DashboardClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Resolve active view ──────────────────────────────────────────────────
  const accessibleViews = TOP_VIEWS.filter(v => v.roles.includes(role));

  function resolveView(): TopView {
    const param = searchParams.get('view') as TopView | null;
    if (param && accessibleViews.some(v => v.key === param)) return param;
    return DEFAULT_VIEW[role];
  }

  function resolveSub(view: TopView): string {
    const param = searchParams.get('sub');
    const subs = SUB_VIEWS[view];
    if (param && subs.some(s => s.key === param)) return param;
    return subs[0]?.key ?? '';
  }

  const activeView = resolveView();
  const activeSub = resolveSub(activeView);

  // ── Resolve filters from URL ─────────────────────────────────────────────
  // Only string-valued FilterState fields are round-tripped via URL params here.
  // Array/number/optional fields (productLines, uwYearNum, customStart, customEnd, dateWindow)
  // are managed by FilterBar's own useSearchParams logic.
  const STRING_FILTER_KEYS: (keyof FilterState)[] = [
    'dateRange', 'productLine', 'handler', 'broker', 'cause',
    'status', 'area', 'actionType', 'tatPosition', 'period', 'netGross', 'uwYear',
  ];

  const filters: FilterState = useMemo(() => {
    const f = { ...DEFAULT_FILTERS };
    for (const k of STRING_FILTER_KEYS) {
      const v = searchParams.get(k);
      if (v !== null) (f as unknown as Record<string, string>)[k] = v;
    }
    return f;
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── My Work handler selector ─────────────────────────────────────────────
  const [myWorkHandler, setMyWorkHandler] = useState<string>(fullName ?? '');

  // ── URL updaters ─────────────────────────────────────────────────────────
  function buildParams(
    view: TopView,
    sub: string,
    newFilters: Partial<FilterState>,
    keepDateRange = false,
  ): string {
    const p = new URLSearchParams();
    p.set('view', view);
    p.set('sub', sub);
    const merged = { ...DEFAULT_FILTERS, ...newFilters };
    if (keepDateRange) merged.dateRange = filters.dateRange;
    for (const k of STRING_FILTER_KEYS) {
      const v = merged[k] as string;
      if (v && v !== (DEFAULT_FILTERS[k] as string)) p.set(k, v);
    }
    return p.toString();
  }

  const handleViewChange = useCallback(
    (view: TopView) => {
      const sub = SUB_VIEWS[view][0]?.key ?? '';
      router.push(`${pathname}?${buildParams(view, sub, {}, true)}`);
    },
    [router, pathname, filters.dateRange], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleSubChange = useCallback(
    (sub: string) => {
      router.push(`${pathname}?${buildParams(activeView, sub, filters)}`);
    },
    [router, pathname, activeView, filters], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleFilterChange = useCallback(
    (key: keyof FilterState, value: string) => {
      router.replace(`${pathname}?${buildParams(activeView, activeSub, { ...filters, [key]: value })}`);
    },
    [router, pathname, activeView, activeSub, filters], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleClearFilters = useCallback(() => {
    router.replace(`${pathname}?${buildParams(activeView, activeSub, { dateRange: filters.dateRange })}`);
  }, [router, pathname, activeView, activeSub, filters.dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Active sub-view config ───────────────────────────────────────────────
  const subDef = SUB_VIEWS[activeView].find(s => s.key === activeSub);

  // ── Render sub-view ──────────────────────────────────────────────────────
  const subProps = { role, userId, filters };

  function renderSubView() {
    if (activeView === 'morning-brief') {
      return <MorningBrief {...subProps} />;
    }
    if (activeView === 'claims') {
      switch (activeSub) {
        case 'management-overview': return <ManagementOverviewClient />;
        case 'portfolio-health':    return <PortfolioHealth {...subProps} />;
        case 'handler-performance': return <HandlerPerformance {...subProps} />;
        case 'broker-lens':         return <BrokerLens {...subProps} />;
        case 'geographic-peril':    return <GeographicPeril {...subProps} />;
        case 'actions-required':    return <ActionsRequired {...subProps} />;
      }
    }
    if (activeView === 'my-work') {
      const myWorkProps = { ...subProps, handlerName: myWorkHandler, onHandlerChange: setMyWorkHandler };
      switch (activeSub) {
        case 'action-list':         return <ActionList {...myWorkProps} />;
        case 'my-portfolio':        return <MyPortfolio {...myWorkProps} />;
        case 'productivity-scores': return <ProductivityScores {...myWorkProps} />;
        case 'cs-sla-health':       return <CsTatHealth {...myWorkProps} />;
      }
    }
    return null;
  }

  return (
    <div className="space-y-0">
      {/* Page heading + Level 1 view tabs */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0D2761]">Dashboard</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">
            {fullName ? `Welcome back, ${fullName.split(' ')[0]}` : 'Welcome back'}
          </p>
        </div>
        <ViewSwitcher role={role} active={activeView} onChange={handleViewChange} />
      </div>

      {/* Level 2 — sub-view tabs (hidden for standalone views) */}
      {activeView !== 'morning-brief' && (
        <SubViewSwitcher view={activeView} active={activeSub} onChange={handleSubChange} />
      )}

      {/* Level 3 — filter bar */}
      {subDef && subDef.filters.length > 0 && (
        <div className="pt-3 pb-1 border-b border-[#E8EEF8]">
          <FilterBar
            filters={filters}
            activeFilters={subDef.filters}
            onChange={handleFilterChange}
            onClear={handleClearFilters}
          />
        </div>
      )}

      {/* Sub-view content */}
      <div className="pt-5">
        {renderSubView()}
      </div>
    </div>
  );
}
