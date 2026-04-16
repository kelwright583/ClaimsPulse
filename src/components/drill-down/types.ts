export type DrillDownType =
  | 'sla_breaches'
  | 'red_flags'
  | 'big_claims'
  | 'unassigned_payment'
  | 'ready_to_close'
  | 'newly_breached'
  | 'value_jumps'
  | 'stagnant'
  | 'handler'
  | 'reserve_by_handler';

export interface DrillDownFilters {
  handler?: string;
  status?: string;
  cause?: string;
  area?: string;
  from?: string;
  to?: string;
}

export interface DrillDownClaim {
  claimId: string;
  handler: string | null;
  claimStatus: string | null;
  secondaryStatus: string | null;
  cause: string | null;
  lossArea: string | null;
  insured: string | null;
  broker: string | null;
  dateOfLoss: string | null;
  daysInCurrentStatus: number | null;
  daysOpen: number | null;
  intimatedAmount: number | null;
  totalPaid: number | null;
  totalOutstanding: number | null;
  totalIncurred: number | null;
  totalRecovery: number | null;
  totalSalvage: number | null;
  isSlaBreach: boolean;
  // Delta-specific
  prevStatus?: string | null;
  prevValue?: number | null;
  // Flags-specific
  flagType?: string | null;
  flagDetail?: string | null;
  flaggedAt?: string | null;
  // Payments-specific
  payee?: string | null;
  estimateType?: string | null;
  grossPaid?: number | null;
  chequeRequested?: string | null;
  chequeAuthorised?: string | null;
  chequePrinted?: string | null;
  // Finalised-specific
  daysToFinalise?: number | null;
  netPaid?: number | null;
  // Parts backorder
  hasAcknowledgedDelay?: boolean;
  expectedDate?: string | null;
}

export interface DrillDownSummary {
  totalClaims: number;
  totalIncurred: number;
  totalOutstanding: number;
  totalPaid: number;
  avgDaysInStatus: number;
  byHandler?: { handler: string; count: number }[];
  byStatus?: { status: string; count: number }[];
  byCause?: { cause: string; count: number }[];
  byArea?: { area: string; count: number }[];
  trend?: { date: string; count: number }[];
  // Type-specific extras
  worstBreachDays?: number;
  avgDaysOverSla?: number;
  totalFlagsCount?: number;
  avgDaysWaiting?: number;
  latestPaymentDate?: string | null;
  totalAmountPaid?: number;
  avgPayment?: number;
  largestPayment?: number;
  avgDaysToFinalise?: number;
  slaBreachCount?: number;
}

export interface DrillDownResponse {
  summary: DrillDownSummary;
  claims: DrillDownClaim[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DrillDownContext {
  type: DrillDownType;
  title: string;
  handlerName?: string; // for handler drill-down
  cause?: string;       // for reserve_by_handler drill-down
}
