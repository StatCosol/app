export type SortOrder = 'ASC' | 'DESC';

export interface TableColumn<T = any> {
  key: keyof T | string;
  label: string;
  width?: string;
  sortable?: boolean;
  hidden?: boolean;
  type?: 'text' | 'number' | 'date' | 'badge' | 'chip';
  /** Custom display string formatter */
  format?: (row: T) => string;
  /** Custom value accessor */
  value?: (row: T) => any;
}

export interface TableQuery {
  page: number;
  limit: number;
  q?: string;
  sort?: string;
  order?: SortOrder;
}

export interface TableResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface BulkAction {
  key: string;
  label: string;
  danger?: boolean;
}
