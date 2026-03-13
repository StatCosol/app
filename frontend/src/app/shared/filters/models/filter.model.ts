export type FilterMode = 'MONTH' | 'FY';

export interface FilterState {
  mode: FilterMode;
  month?: string;       // YYYY-MM
  fy?: string;          // e.g. "FY 2025-26"
  clientId?: string;
  branchId?: string;
  q?: string;
}

export interface ClientOption {
  id: string;
  name: string;
}

export interface BranchOption {
  id: string;
  name: string;
  code?: string;
  state?: string;
}
