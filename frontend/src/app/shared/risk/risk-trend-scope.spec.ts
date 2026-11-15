import '@angular/compiler';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RiskTrendComponent } from './risk-trend.component';

function fixture(role = 'CLIENT', mapped: string[] = []) {
  const reads: Subject<any>[] = [], branches: Subject<any>[] = [], clients: Subject<any>[] = [];
  const request = (list: Subject<any>[]) => { const s = new Subject<any>(); list.push(s); return s; };
  const api = { list: vi.fn(() => request(branches)), getRiskTrend: vi.fn((_p: any) => request(reads)) };
  const crm = { getAssignedClients: () => request(clients), getBranchesForClient: vi.fn((_id: string) => request(branches)) };
  const admin = { getAdminClients: () => request(clients), getBranchesForAdminClient: vi.fn((_id: string) => request(branches)) };
  const c: any = new RiskTrendComponent(api as any, { getRoleCode: () => role, getBranchIds: () => mapped } as any, { markForCheck: vi.fn() } as any, crm as any, admin as any);
  c.from = '2026-11-01'; c.to = '2026-11-15'; c.branchId = 'TEST-A';
  return { c, api, crm, admin, reads, branches, clients };
}
const point = (score: number) => ({ date: '2026-11-10', riskScore: score });

describe('Risk trend scope, validation and recovery', () => {
  for (const field of ['branchId', 'from', 'to']) {
    it('keeps only the latest response after changing ' + field, () => {
      const f = fixture(); f.c.load(); f.c[field] = field === 'branchId' ? 'TEST-B' : '2026-11-12'; f.c.load();
      f.reads[1].next({ points: [point(20)] }); f.reads[0].next({ points: [point(90)] });
      expect(f.c.points).toEqual([point(20)]);
    });
  }
  it('clears previous results immediately and keeps a newer request loading after an old error', () => {
    const f = fixture(); f.c.points = [point(90)]; f.c.load(); expect(f.c.points).toEqual([]);
    f.c.branchId = 'TEST-B'; f.c.load(); f.reads[0].error(Error('old'));
    expect(f.c.loading).toBe(true); f.reads[1].next({ points: [] }); expect(f.c.loading).toBe(false);
  });
  it('invalidates old trend and branch responses when switching CRM client', () => {
    const f = fixture('CRM'); f.c.showClientPicker = true; f.c.clientId = 'TEST-A'; f.c.onClientChange();
    f.branches[0].next([{ id: 'TEST-A-BRANCH' }]);
    f.c.clientId = 'TEST-B'; f.c.onClientChange(); f.branches[1].next([{ id: 'TEST-B-BRANCH' }]);
    f.reads[1].next({ points: [point(20)] }); f.reads[0].next({ points: [point(90)] });
    f.branches[0].next([{ id: 'TEST-A-BRANCH' }]);
    expect(f.c.branchId).toBe('TEST-B-BRANCH'); expect(f.c.points).toEqual([point(20)]);
  });
  it('clears and cancels a pending request when client selection becomes empty', () => {
    const f = fixture('CRM'); f.c.showClientPicker = true; f.c.clientId = 'TEST-A'; f.c.onClientChange();
    f.branches[0].next([{ id: 'TEST-A-BRANCH' }]);
    f.c.clientId = ''; f.c.onClientChange(); f.reads[0].next({ points: [point(90)] });
    expect(f.c.points).toEqual([]); expect(f.c.branchId).toBe(''); expect(f.c.loading).toBe(false);
  });
  for (const [from, to] of [['', '2026-11-15'], ['2026-02-30', '2026-11-15'], ['2026-11-16', '2026-11-15'], ['bad', '2026-11-15']]) {
    it('does not request an invalid date range ' + from, () => {
      const f = fixture(); f.c.from = from; f.c.to = to; f.c.load();
      expect(f.api.getRiskTrend).not.toHaveBeenCalled(); expect(f.c.loadError).toContain('valid date range');
    });
  }
  it('distinguishes failed trend loading from a confirmed empty result and retries', () => {
    const f = fixture(); f.c.load(); f.reads[0].error(Error('offline'));
    expect(f.c.loadError).toBeTruthy(); expect(f.c.trendLoaded).toBe(false);
    f.c.load(); f.reads[1].next({ points: [] }); expect(f.c.loadError).toBe(''); expect(f.c.trendLoaded).toBe(true);
  });
  it('retries failed client options and then scopes the branch request', () => {
    const f = fixture('CRM'); f.c.ngOnInit(); f.clients[0].error(Error('offline'));
    expect(f.c.clientLoadError).toBeTruthy(); expect(f.api.getRiskTrend).not.toHaveBeenCalled();
    f.c.retryClients(); f.clients[1].next([{ id: 'TEST-C' }]);
    expect(f.crm.getBranchesForClient).toHaveBeenLastCalledWith('TEST-C');
  });
  it('retries a failed branch list and does not retain the previous branch', () => {
    const f = fixture('CRM'); f.c.showClientPicker = true; f.c.clientId = 'TEST-C'; f.c.onClientChange();
    f.branches[0].error(Error('offline')); expect(f.c.branchLoadError).toBeTruthy(); expect(f.c.branchId).toBe('');
    f.c.retryBranches(); f.branches[1].next([{ id: 'TEST-C-BRANCH' }]);
    expect(f.api.getRiskTrend.mock.lastCall?.[0].branchId).toBe('TEST-C-BRANCH');
  });
  it('retries mapped branch names without discarding a newer branch selection or results', () => {
    const f = fixture('CLIENT', ['TEST-A', 'TEST-B']); f.c.ngOnInit();
    f.c.branchId = 'TEST-B'; f.c.load(); f.reads[1].next({ points: [point(20)] }); f.branches[0].error(Error('offline'));
    f.c.retryBranches(); f.branches[1].next([{ id: 'TEST-A', name: 'A' }, { id: 'TEST-B', name: 'B' }]);
    expect(f.c.branchId).toBe('TEST-B'); expect(f.c.points).toEqual([point(20)]); expect(f.reads).toHaveLength(2);
  });
  it('never requests a trend for a branch user without an assigned branch', () => {
    const f = fixture('BRANCH_DESK'); f.c.ngOnInit();
    expect(f.c.showClientPicker).toBe(false); f.branches[0].next([]);
    expect(f.api.getRiskTrend).not.toHaveBeenCalled(); expect(f.c.branchId).toBe('');
  });
  it('cancels all reads on destruction', () => {
    const f = fixture('CLIENT', ['TEST-A']); f.c.ngOnInit(); f.c.ngOnDestroy();
    expect([...f.reads, ...f.branches].every(s => !s.observed)).toBe(true);
  });
});
