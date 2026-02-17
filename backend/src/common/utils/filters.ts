/**
 * Dashboard filter normalization utilities
 * Converts query string parameters to SQL-safe values
 */

export interface DashboardFilters {
  clientId: string | null;
  state: string | null;
  fromDate: string | null;
  toDate: string | null;
  windowDays: number;
}

export interface ScopedDashboardFilters extends DashboardFilters {
  userId: string; // CRM or Auditor user ID from JWT
}

export interface DateFilters {
  clientId: string | null;
  branchId: string | null;
  fromDate: string | null;
  toDate: string | null;
  windowDays: number;
}

export interface PagingParams {
  limit: number;
  offset: number;
}

/**
 * Normalize admin dashboard filters (no user scoping)
 */
export function normalizeAdminFilters(query: any): DashboardFilters {
  return {
    clientId: query.clientId ?? null,
    state: query.state ?? null,
    fromDate: query.fromDate ?? null,
    toDate: query.toDate ?? null,
    windowDays: Number(query.windowDays ?? 30),
  };
}

/**
 * Normalize CRM dashboard filters (requires user ID from JWT)
 */
export function normalizeCrmFilters(
  userId: string,
  query: any,
): ScopedDashboardFilters {
  return {
    userId, // From JWT token - NEVER from query params
    clientId: query.clientId ?? null,
    state: null, // CRM doesn't filter by state
    fromDate: query.fromDate ?? null,
    toDate: query.toDate ?? null,
    windowDays: Number(query.windowDays ?? 30),
  };
}

/**
 * Normalize Auditor dashboard filters (requires user ID from JWT)
 */
export function normalizeAuditorFilters(
  userId: string,
  query: any,
): ScopedDashboardFilters {
  return {
    userId, // From JWT token - NEVER from query params
    clientId: query.clientId ?? null,
    state: null, // Auditor doesn't filter by state
    fromDate: query.fromDate ?? null,
    toDate: query.toDate ?? null,
    windowDays: Number(query.windowDays ?? 30),
  };
}

/**
 * Normalize tab filters for list endpoints
 */
export function normalizeTabFilters(query: any) {
  return {
    tab: query.tab ?? null,
    status: query.status ?? null,
    risk: query.risk ?? null,
  };
}

/**
 * Normalize date filters with optional branchId
 * Used for CRM and Auditor queries
 */
export function normalizeDateFilters(query: any): DateFilters {
  return {
    clientId: query.clientId ?? null,
    branchId: query.branchId ?? null,
    fromDate: query.fromDate ?? null, // YYYY-MM-DD or null
    toDate: query.toDate ?? null, // YYYY-MM-DD or null
    windowDays: Number(query.windowDays ?? 30),
  };
}

/**
 * Normalize pagination parameters
 * Enforces limits: 1-500 rows, default 200
 */
export function normalizePaging(query: any): PagingParams {
  const limit = Math.min(Math.max(Number(query.limit ?? 200), 1), 500);
  const offset = Math.max(Number(query.offset ?? 0), 0);
  return { limit, offset };
}
