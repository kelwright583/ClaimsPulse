export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface ImportResult {
  success: boolean;
  rowsRead: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsErrored: number;
  errors?: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ClaimsQuery {
  handler?: string;
  claimStatus?: string;
  secondaryStatus?: string;
  cause?: string;
  broker?: string;
  isTatBreach?: boolean;
  snapshotDate?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}
