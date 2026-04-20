export interface ClaimSnapshot {
  id: string;
  importRunId: string;
  snapshotDate: Date;
  claimId: string;
  oldClaimId?: string | null;
  handler?: string | null;
  claimStatus?: string | null;
  secondaryStatus?: string | null;
  orgUnit?: string | null;
  uwYear?: number | null;
  groupCode?: string | null;
  groupDesc?: string | null;
  sectionDesc?: string | null;
  productLine?: string | null;
  policyNumber?: string | null;
  insured?: string | null;
  broker?: string | null;
  dateOfLoss?: Date | null;
  dateOfNotification?: Date | null;
  dateOfRegistration?: Date | null;
  cause?: string | null;
  lossArea?: string | null;
  lossAddr?: string | null;
  intimatedAmount?: number | null;
  retainedPct?: number | null;
  deductible?: number | null;
  ownDamagePaid?: number | null;
  thirdPartyPaid?: number | null;
  expensesPaid?: number | null;
  legalCostsPaid?: number | null;
  assessorFeesPaid?: number | null;
  repairAuthPaid?: number | null;
  cashLieuPaid?: number | null;
  glassAuthPaid?: number | null;
  partsAuthPaid?: number | null;
  towingPaid?: number | null;
  additionalsPaid?: number | null;
  tpLiabilityPaid?: number | null;
  investigationPaid?: number | null;
  totalPaid?: number | null;
  totalRecovery?: number | null;
  totalSalvage?: number | null;
  ownDamageOs?: number | null;
  thirdPartyOs?: number | null;
  expensesOs?: number | null;
  legalCostsOs?: number | null;
  assessorFeesOs?: number | null;
  repairAuthOs?: number | null;
  cashLieuOs?: number | null;
  glassAuthOs?: number | null;
  tpLiabilityOs?: number | null;
  totalOs?: number | null;
  totalIncurred?: number | null;
  sectionSumInsured?: number | null;
  notificationGapDays?: number | null;
  reserveUtilisationPct?: number | null;
  complexityWeight?: number | null;
  deltaFlags?: Record<string, boolean> | null;
  isTatBreach: boolean;
  daysInCurrentStatus?: number | null;
}

export interface TatConfig {
  id: string;
  secondaryStatus: string;
  maxDays: number;
  alertRole: string;
  priority: 'critical' | 'urgent' | 'standard';
  isActive: boolean;
  updatedBy?: string | null;
  updatedAt: Date;
  createdAt: Date;
}

export interface AcknowledgedDelay {
  id: string;
  claimId: string;
  secondaryStatus: string;
  reasonType: string;
  note?: string | null;
  expectedDate: Date;
  loggedBy: string;
  loggedAt: Date;
  resolvedAt?: Date | null;
  isActive: boolean;
  isOverdue: boolean;
}

export type SlaPriority = 'critical' | 'urgent' | 'standard';

export const ACKNOWLEDGED_DELAY_REASONS = [
  'Waiting for assessor report',
  'Parts on back order',
  'Awaiting broker response',
  'Awaiting insured response',
  'Legal proceedings',
  'SASRIA involvement',
  'Investigation ongoing',
  'Management approval required',
  'Third party claim in process',
  'Salvage recovery in process',
  'Other',
] as const;
