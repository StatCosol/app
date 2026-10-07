import { EMPTY, Observable, defer, expand, map, reduce } from 'rxjs';

/** Collect complete server pages; a failed or stalled page fails the whole load. */
export function loadAllPages<T>(fetch: (page: number) => Observable<any>): Observable<T[]> {
  const unpack = (response: any, page: number, count: number) => {
    const rows: T[] = Array.isArray(response) ? response : response?.data ?? response?.items;
    if (!Array.isArray(rows)) throw new Error('Invalid list response');
    const total = Number(response?.total ?? count + rows.length);
    if (!rows.length && count < total) throw new Error('Incomplete list response. Please retry.');
    return { rows, page, count: count + rows.length, total };
  };
  return defer(() => fetch(1)).pipe(
    map(response => unpack(response, 1, 0)),
    expand(state => state.count < state.total
      ? fetch(state.page + 1).pipe(map(response => unpack(response, state.page + 1, state.count)))
      : EMPTY),
    reduce((rows, state) => rows.concat(state.rows), [] as T[]),
  );
}
