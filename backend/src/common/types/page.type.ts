/**
 * Standard paginated response envelope.
 * Must stay in sync with the frontend `PageRes<T>` interface.
 */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
