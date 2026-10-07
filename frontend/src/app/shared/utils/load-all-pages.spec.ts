import { describe, expect, it, vi } from 'vitest';
import { firstValueFrom, of, throwError } from 'rxjs';
import { loadAllPages } from './load-all-pages';
describe('Complete paginated lists', () => {
  it.each([251, 1001])('collects %s records across the old display limit', async total => {
    const size = total === 251 ? 250 : 1000;
    const fetch = vi.fn((page: number) => of({data: Array.from({length: page === 1 ? size : 1}, (_, i) => (page - 1) * size + i), total}));
    expect((await firstValueFrom(loadAllPages(fetch))).length).toBe(total);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not return partial data when a later page fails', async () => {
    await expect(firstValueFrom(loadAllPages(page => page === 1 ? of({data: [1], total: 2}) : throwError(() => new Error('offline'))))).rejects.toThrow('offline');
  });
  it('fails instead of looping when a page unexpectedly has no records', async () => {
    await expect(firstValueFrom(loadAllPages(() => of({data: [], total: 2})))).rejects.toThrow('Incomplete');
  });
});
