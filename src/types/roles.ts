export type UserRole =
  | 'SENIOR_MANAGEMENT'
  | 'HEAD_OF_CLAIMS'
  | 'TEAM_LEADER'
  | 'CLAIMS_TECHNICIAN'
  | 'TP_HANDLER'
  | 'SALVAGE_HANDLER';

export const ROLE_PERMISSIONS = {
  canSeeFinancials: ['SENIOR_MANAGEMENT', 'HEAD_OF_CLAIMS'] as UserRole[],
  canSeeAllClaims: ['HEAD_OF_CLAIMS', 'TEAM_LEADER'] as UserRole[],
  canSeeTeamProductivity: ['HEAD_OF_CLAIMS', 'TEAM_LEADER'] as UserRole[],
  canConfigureSla: ['HEAD_OF_CLAIMS'] as UserRole[],
  canSeeIntegrity: ['HEAD_OF_CLAIMS'] as UserRole[],
  canSeeTpWorkbench: ['HEAD_OF_CLAIMS', 'TEAM_LEADER', 'TP_HANDLER'] as UserRole[],
  canSeeSalvageWorkbench: ['HEAD_OF_CLAIMS', 'TEAM_LEADER', 'SALVAGE_HANDLER'] as UserRole[],
  canUploadReports: ['HEAD_OF_CLAIMS', 'TEAM_LEADER'] as UserRole[],
  canLogAcknowledgedDelay: ['HEAD_OF_CLAIMS', 'TEAM_LEADER', 'CLAIMS_TECHNICIAN', 'TP_HANDLER', 'SALVAGE_HANDLER'] as UserRole[],
  canManageUsers: ['HEAD_OF_CLAIMS'] as UserRole[],
} as const;

export function hasPermission(role: UserRole, permission: keyof typeof ROLE_PERMISSIONS): boolean {
  return (ROLE_PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SENIOR_MANAGEMENT: 'Senior Management',
  HEAD_OF_CLAIMS: 'Head of Claims',
  TEAM_LEADER: 'Team Leader',
  CLAIMS_TECHNICIAN: 'Claims Technician',
  TP_HANDLER: 'TP Handler',
  SALVAGE_HANDLER: 'Salvage Handler',
};
