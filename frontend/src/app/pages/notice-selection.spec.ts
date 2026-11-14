import '@angular/compiler';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ClientNoticesComponent } from './client/notices/client-notices.component';
import { BranchNoticesComponent } from './branch/notices/branch-notices.component';
import { CrmNoticesComponent } from './crm/notices/crm-notices.component';

const notice = (id: string) => ({ id, noticeCode: `TEST-${id}`, subject: `TEST ONLY ${id}`, status: 'RECEIVED', noticeType: 'GENERAL', severity: 'LOW', documents: [{ fileName: `TEST ONLY ${id}.pdf`, fileUrl: `synthetic:${id}` }] });
const counters = (total: number) => ({ total, received: total, underReview: 0, actionRequired: 0, responseDrafted: 0, responseSubmitted: 0, closed: 0, escalated: 0, overdue: 0, critical: 0 });
function setup(role: 'client' | 'branch' | 'crm') {
  const details: Subject<any>[] = [], lists: Subject<any[]>[] = [], kpis: Subject<any>[] = [];
  const api: any = {
    [`${role}GetOne`]: vi.fn(() => { const s = new Subject<any>(); details.push(s); return s; }),
    [`${role}List`]: vi.fn(() => { const s = new Subject<any[]>(); lists.push(s); return s; }),
    [`${role}Kpis`]: vi.fn(() => { const s = new Subject<any>(); kpis.push(s); return s; }),
  };
  const cdr = { detectChanges() {}, markForCheck() {} };
  const c: any = role === 'client' ? new ClientNoticesComponent(api, { run: (fn: () => void) => fn() } as any, cdr as any)
    : role === 'branch' ? new BranchNoticesComponent(api, cdr as any) : new CrmNoticesComponent(api, {} as any);
  const select = (id: string) => role === 'crm' ? c.selectNotice(notice(id)) : c.toggleNotice(notice(id));
  const load = () => role === 'crm' ? c.loadAll() : c.load();
  const detail = () => role === 'crm' ? c.selected : c.detail;
  const finish = (stream: Subject<any>, value: any) => { stream.next(value); stream.complete(); };
  return { c, api, details, lists, kpis, select, load, detail, finish };
}

describe.each(['client', 'branch', 'crm'] as const)('%s notice selection identity', role => {
  it('clears the previous notice document details as soon as another selection begins', () => {
    const f = setup(role); f.select('A'); f.finish(f.details[0], notice('A')); f.select('B');
    expect(f.detail()).toBeNull(); expect(f.c.detailLoading).toBe(true);
    f.finish(f.details[1], notice('B')); expect(f.detail()?.id).toBe('B'); expect(f.c.detailLoading).toBe(false); f.c.ngOnDestroy();
  });
  it('keeps B details when A completes late', () => {
    const f = setup(role); f.select('A'); f.select('B'); f.finish(f.details[1], notice('B')); f.finish(f.details[0], notice('A'));
    expect(f.detail()?.id).toBe('B'); expect(f.c.detailError).toBeFalsy(); f.c.ngOnDestroy();
  });
  it('ignores the first A response after A to B to A reselection', () => {
    const f = setup(role); f.select('A'); f.select('B'); f.select('A');
    f.finish(f.details[2], { ...notice('A'), referenceNo: 'TEST NEW A' });
    f.finish(f.details[0], { ...notice('A'), referenceNo: 'TEST OLD A' });
    expect(f.detail()?.referenceNo).toBe('TEST NEW A'); f.c.ngOnDestroy();
  });
  it('does not reopen closed detail when its request completes', () => {
    const f = setup(role); f.select('A'); f.c.closeDetail(); f.finish(f.details[0], notice('A'));
    expect(f.detail()).toBeNull(); expect(f.c.detailLoading).toBe(false); f.c.ngOnDestroy();
  });
  it('clears detail selection on filter reload and rejects its late result', () => {
    const f = setup(role); f.select('A'); f.c.search = 'TEST B'; f.load(); f.finish(f.details[0], notice('A'));
    expect(f.detail()).toBeNull(); expect(f.c.detailLoading).toBe(false); f.c.ngOnDestroy();
  });
  it('keeps current detail loading when the obsolete request errors', () => {
    const f = setup(role); f.select('A'); f.select('B'); f.details[0].error(new Error('TEST OLD unavailable'));
    expect(f.c.detailLoading).toBe(true); expect(f.c.detailError).toBeFalsy();
    f.finish(f.details[1], notice('B')); expect(f.detail()?.id).toBe('B'); f.c.ngOnDestroy();
  });
  it('shows current detail failure without stale documents and allows a scoped retry', () => {
    const f = setup(role); f.select('A'); f.finish(f.details[0], notice('A')); f.select('B'); f.details[1].error(new Error('TEST current unavailable'));
    expect(f.detail()).toBeNull(); expect(f.c.detailError).toBeTruthy(); expect(f.c.detailLoading).toBe(false);
    f.c.retryDetail(); expect(f.api[`${role}GetOne`]).toHaveBeenLastCalledWith('B');
    f.finish(f.details[2], notice('B')); expect(f.detail()?.id).toBe('B'); expect(f.c.detailError).toBeFalsy(); f.c.ngOnDestroy();
  });
  it('cancels details when the component is destroyed', () => {
    const f = setup(role); f.select('A'); f.c.ngOnDestroy(); f.finish(f.details[0], notice('A'));
    expect(f.detail()).toBeNull();
  });
  it('rejects a mismatched detail response identity', () => {
    const f = setup(role); f.select('B'); f.finish(f.details[0], notice('A'));
    expect(f.detail()).toBeNull(); expect(f.c.detailError).toBeTruthy(); f.c.ngOnDestroy();
  });
  it('keeps current filtered rows after an obsolete list response', () => {
    const f = setup(role); f.c.search = 'TEST A'; f.load(); f.c.search = 'TEST B'; f.load();
    f.finish(f.lists[1], [notice('B')]); f.finish(f.lists[0], [notice('A')]);
    expect(f.c.notices.map((n: any) => n.id)).toEqual(['B']); expect(f.c.loading).toBe(false); f.c.ngOnDestroy();
  });
  it('does not let an obsolete list error finish or erase a newer pending list', () => {
    const f = setup(role); f.load(); f.load(); f.lists[0].error(new Error('TEST old list failure'));
    expect(f.c.loading).toBe(true); expect(f.c.listError).toBeFalsy();
    f.finish(f.lists[1], [notice('B')]); expect(f.c.notices[0].id).toBe('B'); f.c.ngOnDestroy();
  });
  it('shows list failures explicitly instead of reporting no notices', () => {
    const f = setup(role); f.load(); f.lists[0].error(new Error('TEST current list failure'));
    expect(f.c.listError).toBeTruthy(); expect(f.c.loading).toBe(false); expect(f.c.notices).toEqual([]); f.c.ngOnDestroy();
  });
});

describe.each(['client', 'branch'] as const)('%s notice row collapse', role => {
  it('does not retain a pending detail after toggling the selected row closed', () => {
    const f = setup(role); f.select('A'); f.select('A'); f.finish(f.details[0], notice('A'));
    expect(f.c.selected).toBeNull(); expect(f.detail()).toBeNull(); expect(f.c.detailLoading).toBe(false); f.c.ngOnDestroy();
  });
});

describe('CRM notice KPI client scope', () => {
  it('ignores older client counters after the current client has loaded', () => {
    const f = setup('crm'); f.c.clientFilter = 'TEST-A'; f.load(); f.c.clientFilter = 'TEST-B'; f.load();
    f.finish(f.kpis[1], counters(2)); f.finish(f.kpis[0], counters(9));
    expect(f.c.kpis.total).toBe(2); f.c.ngOnDestroy();
  });
  it('does not preserve previous client counters when the current client read fails', () => {
    const f = setup('crm'); f.c.clientFilter = 'TEST-A'; f.load(); f.finish(f.kpis[0], counters(9));
    f.c.clientFilter = 'TEST-B'; f.load(); expect(f.c.kpis).toBeNull(); f.kpis[1].error(new Error('TEST current KPI failure'));
    expect(f.c.kpis).toBeNull(); expect(f.c.kpiError).toBeTruthy(); f.c.ngOnDestroy();
  });
});
