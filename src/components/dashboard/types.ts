import type { UserRole } from '@/types/roles';

export type TopView = 'morning-brief' | 'claims' | 'my-work';

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
  tatPosition: string;
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
  tatPosition: '',
  period: 'monthly',
  netGross: 'net',
  uwYear: '',
};

export const TOP_VIEWS: { key: TopView; label: string; roles: UserRole[] }[] = [
  {
    key: 'morning-brief',
    label: 'Morning Brief',
    roles: ['HEAD_OF_CLAIMS', 'TEAM_LEADER'],
  },
  {
    key: 'claims',
    label: 'Management overview',
    roles: ['HEAD_OF_CLAIMS', 'TEAM_LEADER'],
  },
  {
    key: 'my-work',
    label: 'My work',
    roles: ['HEAD_OF_CLAIMS', 'TEAM_LEADER', 'CLAIMS_TECHNICIAN', 'TP_HANDLER', 'SALVAGE_HANDLER'],
  },
];

export const DEFAULT_VIEW: Record<UserRole, TopView> = {
  SENIOR_MANAGEMENT: 'morning-brief',
  HEAD_OF_CLAIMS: 'morning-brief',
  TEAM_LEADER: 'morning-brief',
  CLAIMS_TECHNICIAN: 'my-work',
  TP_HANDLER: 'my-work',
  SALVAGE_HANDLER: 'my-work',
  MAILBOX_ADMIN: 'morning-brief',
  UW_ANALYST: 'morning-brief',
};

export const SUB_VIEWS: Record<TopView, SubViewDef[]> = {
  'morning-brief': [],
  claims: [
    { key: 'management-overview',  label: 'Management overview',  filters: [] },
    { key: 'portfolio-health',     label: 'Portfolio health',     filters: ['dateRange', 'productLine', 'cause', 'status'] },
    { key: 'handler-performance',  label: 'Handler performance',  filters: ['handler', 'cause', 'dateRange'] },
    { key: 'broker-lens',          label: 'Broker lens',          filters: ['broker', 'productLine', 'dateRange'] },
    { key: 'geographic-peril',     label: 'Geographic & peril',   filters: ['area', 'cause', 'dateRange', 'status'] },
    { key: 'actions-required',     label: 'Actions required',     filters: ['actionType', 'handler', 'status'] },
  ],
  'my-work': [
    { key: 'action-list',         label: 'Action list',         filters: [] },
    { key: 'my-portfolio',        label: 'My portfolio',        filters: ['status', 'cause', 'tatPosition'] },
    { key: 'productivity-scores', label: 'Productivity scores', filters: [] },
    { key: 'cs-sla-health',       label: 'CS & TAT health',     filters: [] },
  ],
};
