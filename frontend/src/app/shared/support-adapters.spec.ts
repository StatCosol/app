import '@angular/compiler';
import { of, throwError, firstValueFrom, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ClientThreadApiService } from '../core/client-thread-api.service';
import { BranchThreadApiService } from '../core/branch-thread-api.service';
import { CrmThreadApiService } from '../core/crm-thread-api.service';
import { AuditorThreadApiService } from '../core/auditor-thread-api.service';
import { ContractorThreadApiService } from '../core/contractor-thread-api.service';
import { PaydekThreadApiService } from '../core/paydek-thread-api.service';
import { CcoThreadApiService } from '../core/cco-thread-api.service';
import { CeoThreadApiService } from '../core/ceo-thread-api.service';

const portals = [
  ClientThreadApiService,
  BranchThreadApiService,
  CrmThreadApiService,
  AuditorThreadApiService,
  ContractorThreadApiService,
  PaydekThreadApiService,
  CcoThreadApiService,
];
describe.each(portals)('%s support attachments (isolated HTTP)', (Service) => {
  it.each([2, 5])('preserves all %i synthetic files and the target thread', async (count) => {
    const http = { post: vi.fn(() => of({ ok: true })) };
    const api = new (Service as any)(http, {});
    const files = Array.from(
      { length: count },
      (_, i) => new File([`TEST ONLY ${i}`], `TEST-${i}.pdf`, { type: 'application/pdf' }),
    );
    await firstValueFrom(api.reply('TEST-THREAD', 'TEST attachment reply', files));
    const [url, body] = http.post.mock.calls[0] as unknown as [string, FormData];
    expect(url).toMatch(/\/notifications\/threads\/TEST-THREAD\/reply$/);
    expect(body.get('message')).toBe('TEST attachment reply');
    const submitted = body.getAll('files') as File[];
    expect(submitted.map((f) => f.name)).toEqual(files.map((f) => f.name));
    expect(await Promise.all(submitted.map((f) => f.text()))).toEqual(
      files.map((_, i) => `TEST ONLY ${i}`),
    );
    expect(http.post).toHaveBeenCalledOnce();
  });
  it('propagates upload rejection without retrying or changing the input files', async () => {
    const failure = new Error('TEST upload rejection');
    const http = { post: vi.fn(() => throwError(() => failure)) };
    const api = new (Service as any)(http, {});
    const files = [new File(['TEST ONLY'], 'TEST.pdf', { type: 'application/pdf' })];
    await expect(firstValueFrom(api.reply('TEST-THREAD', 'TEST', files))).rejects.toBe(failure);
    expect(http.post).toHaveBeenCalledOnce();
    expect(files[0].name).toBe('TEST.pdf');
  });
});

describe.each([CcoThreadApiService, CeoThreadApiService])(
  '%s inbox beyond the first server page',
  (Service) => {
    const rows = Array.from({ length: 125 }, (_, i) => ({
      id: `TEST-${i + 1}`,
      subject: `TEST subject ${i + 1}`,
      queryType: i === 124 ? 'AUDIT' : 'GENERAL',
      createdBy: { name: i === 124 ? 'TEST reviewer' : 'Someone' },
      clientName: i === 124 ? 'TEST company' : '',
      branchName: i === 124 ? 'TEST branch' : '',
    }));
    function setup(failPage = 0) {
      const http = {
        get: vi.fn((_url: string, options: any) => {
          const page = Number(options.params.get('page') || 1),
            limit = Number(options.params.get('limit') || 20);
          return page === failPage
            ? throwError(() => new Error('TEST later page outage'))
            : of({
                data: rows.slice((page - 1) * limit, page * limit),
                total: rows.length,
                page,
                limit,
              });
        }),
      };
      return { http, api: new Service(http as any) };
    }
    it('returns the second visible page and full total', async () => {
      const { api } = setup();
      const result = await firstValueFrom(api.list({ page: 2, limit: 20 }));
      expect(result.total).toBe(125);
      expect(result.items.map((i) => i.id)).toEqual(rows.slice(20, 40).map((i) => i.id));
    });
    it.each(['TEST reviewer', 'TEST company', 'TEST branch'])(
      'finds %s after the first 100 rows',
      async (q) => {
        const { api, http } = setup();
        const result = await firstValueFrom(
          api.list({ q, type: 'AUDIT', status: 'OPEN', unread: true }),
        );
        expect(result.total).toBe(1);
        expect(result.items[0]?.id).toBe('TEST-125');
        for (const [, options] of http.get.mock.calls) {
          expect(options.params.get('status')).toBe('OPEN');
          expect(options.params.get('unreadOnly')).toBe('1');
        }
      },
    );
    it('does not report a partial list as complete when a later page fails', async () => {
      const { api } = setup(2);
      await expect(firstValueFrom(api.list({}))).rejects.toThrow('TEST later page outage');
    });
    it('unsubscribes the pending page when scope is abandoned', () => {
      const pending = new Subject<any>();
      const http = { get: vi.fn(() => pending) };
      const subscription = new Service(http as any).list({}).subscribe();
      expect(pending.observed).toBe(true);
      subscription.unsubscribe();
      expect(pending.observed).toBe(false);
    });
  },
);
