/**
 * Shared paging request / response interfaces.
 * Used across all modules for server-side pagination.
 */

export interface PageReq {
  page: number;
  limit: number;
  sort?: string;
  order?: 'ASC' | 'DESC';
  q?: string;
}

export interface PageRes<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
