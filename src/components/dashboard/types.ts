import type { UserRole } from '@/types/roles';

export type TopView = 'claims' | 'executive' | 'my-work';

export interface SubViewDef {
  key: string;
  label: string;
  filters: (keyof FilterState)[];
}

export interface FilterState {
  dateRange: 'this-month' | 'last-month' | 'last-3-months' | 'ytd' | 'custom';
  productLine: string;
  handler: string;
  broker: string;
  cause: string;
  status: string;
  area: string;
  actionType: string;
  slaPosition: string;
  period: string;
  netGross: 'net' | 'gross';
  uwYear: string;
}

export const DEFAULT_FILTERS: FilterState = {
  dateRange: 'this-month',
  productLine: '',
  handler: '',
  broker: '',
  cause: '',
  status: '',
  area: '',
  actionType: '',
  slaPosition: '',
  period: 'monthly',
  netGross: 'net',
  uwYear: '',
};

export const TOP_VIEWS: { key: TopView; label: string; roles: UserRole[] }[] = [
  {
    key: 'claims',
    label: 'Claims view',
    roles: ['HEAD_OF_CLAIMS', 'TEAM_LEADER'],
  },
  {
    key: 'executive',
    label: 'Executive view',
    roles: ['SENIOR_MANAGEMENT', 'HEAD_OF_CLAIMS'],
  },
  {
    key: 'my-work',
    label: 'My work',
    roles: ['HEAD_OF_CLAIMS', 'TEAM_LEADER', 'CLAIMS_TECHNICIAN', 'TP_HANDLER', 'SALVAGE_HANDLER'],
  },
];

export const DEFAULT_VIEW: Record<UserRole, TopView> = {
  SENIOR_MANAGEMENT: 'executive',
  HEAD_OF_CLAIMS: 'claims',
  TEAM_LEADER: 'claims',
  CLAIMS_TECHNICIAN: 'my-work',
  TP_HANDLER: 'my-work',
  SALVAGE_HANDLER: 'my-work',
};

export const SUB_VIEWS: Record<TopView, SubViewDef[]> = {
  claims: [
    { key: 'morning-brief',      label: 'Morning brief',       filters: [] },
    { key: 'portfolio-health',   label: 'Portfolio health',    filters: ['dateRange', 'productLine', 'cause', 'status'] },
    { key: 'handler-performance',label: 'Handler performance', filters: ['handler', 'cause', 'dateRange'] },
    { key: 'broker-lens',        label: 'Broker lens',         filters: ['broker', 'productLine', 'dateRange'] },
    { key: 'geographic-peril',   label: 'Geographic & peril',  filters: ['area', 'cause', 'dateRange', 'status'] },
    { key: 'actions-required',   label: 'Actions required',    filters: ['actionType', 'handler', 'status'] },
  ],
  executive: [
    { key: 'performance-vs-target', label: 'Performance vs target', filters: ['productLine', 'uwYear'] },
    { key: 'financial-summary',     label: 'Financial summary',     filters: ['period'] },
    { key: 'growth-trajectory',     label: 'Growth trajectory',     filters: ['productLine', 'broker'] },
    { key: 'scenario-modeller',     label: 'Scenario modeller',     filters: [] },
    { key: 'big-claims-watch',      label: 'Big claims watch',      filters: ['cause', 'handler', 'dateRange'] },
  ],
  'my-work': [
    { key: 'action-list',         label: 'Action list',         filters: [] },
    { key: 'my-portfolio',        label: 'My portfolio',        filters: ['status', 'cause', 'slaPosition'] },
    { key: 'productivity-scores', label: 'Productivity scores', filters: [] },
    { key: 'cs-sla-health',       label: 'CS & SLA health',     filters: [] },
  ],
};
