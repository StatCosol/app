import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Page } from '../types/page.type';

/**
 * Add ILIKE search across whitelisted columns.
 * If `search` is falsy or `columns` is empty, the QB is returned unchanged.
 */
export function applySearch<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  search: string | undefined,
  columns: string[],
): SelectQueryBuilder<T> {
  if (!search?.trim() || !columns.length) return qb;
  const param = `%${search.trim().replace(/%/g, '\\%')}%`;
  const clauses = columns.map((c) => `${c} ILIKE :__q`).join(' OR ');
  qb.andWhere(`(${clauses})`, { __q: param });
  return qb;
}

/**
 * Sort configuration for list endpoints.
 */
export interface SortConfig {
  /** Map of frontend sort keys to actual DB columns, e.g. { dueDate: 't.dueDate' } */
  sortMap: Record<string, string>;
  /** Default DB column to sort by when no sort key provided */
  defaultSort: string;
  /** Default direction when not specified (default: 'ASC') */
  defaultOrder?: 'ASC' | 'DESC';
}

/**
 * Sort by a column via sortMap key lookup, falling back to `defaultSort`.
 * Accepts either the full SortConfig object or the legacy (allowed[], defaultSort) args.
 */
export function applySort<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  sort: string | undefined,
  order: string | undefined,
  configOrAllowed: SortConfig | string[],
  defaultSortLegacy?: string,
): SelectQueryBuilder<T> {
  let col: string;
  let fallbackDir: 'ASC' | 'DESC' = 'ASC';

  if (Array.isArray(configOrAllowed)) {
    // Legacy path: allowed[] + defaultSort
    col =
      sort && configOrAllowed.includes(sort)
        ? sort
        : (defaultSortLegacy ?? configOrAllowed[0] ?? 'id');
  } else {
    // New path: SortConfig with sortMap
    const mapped = sort ? configOrAllowed.sortMap[sort] : undefined;
    col = mapped ?? configOrAllowed.defaultSort;
    fallbackDir = configOrAllowed.defaultOrder ?? 'ASC';
  }

  const dir: 'ASC' | 'DESC' =
    order?.toUpperCase() === 'DESC'
      ? 'DESC'
      : order?.toUpperCase() === 'ASC'
        ? 'ASC'
        : fallbackDir;
  qb.orderBy(col, dir);
  return qb;
}

/**
 * Apply skip/take pagination and return a `Page<T>`.
 */
export async function paginate<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  page = 1,
  limit = 25,
): Promise<Page<T>> {
  const p = Math.max(page, 1);
  const l = Math.min(Math.max(limit, 1), 200);
  const [items, total] = await qb
    .skip((p - 1) * l)
    .take(l)
    .getManyAndCount();
  return { items, total, page: p, limit: l };
}

/**
 * Like `paginate` but uses `getRawMany()` + `getCount()`.
 * Useful for queries that use custom selects / aliases.
 */
export async function paginateRaw<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  page = 1,
  limit = 25,
): Promise<Page<Record<string, any>>> {
  const p = Math.max(page, 1);
  const l = Math.min(Math.max(limit, 1), 200);
  const total = await qb.getCount();
  const items = await qb
    .offset((p - 1) * l)
    .limit(l)
    .getRawMany();
  return { items, total, page: p, limit: l };
}
