import '@angular/compiler';
import { Subject } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { ComplianceCalendarComponent } from './compliance-calendar.component';
import { ClientComplianceRemindersComponent } from '../../pages/client/reminders/client-compliance-reminders.component';

function calendar(role = 'CLIENT', branchIds: string[] = []) {
  const reads: Subject<any>[] = [], branches: Subject<any>[] = [], clients = new Subject<any>();
  const request = (list: Subject<any>[]) => { const s = new Subject<any>(); list.push(s); return s; };
  const api = { getCalendar: vi.fn((_params: any) => request(reads)), list: vi.fn(() => request(branches)) };
  const crm = { getBranchesForClient: vi.fn((_id: string) => request(branches)) };
  const c: any = new ComplianceCalendarComponent(
    { markForCheck: vi.fn() } as any, api as any,
    { getRoleCode: () => role, getBranchIds: () => branchIds } as any,
    { getAssignedClientsCached: () => clients } as any, crm as any,
  );
  c.month = '2026-10'; c.isCrm = role === 'CRM';
  return { c, reads, branches, clients, api, crm };
}
const item = (title: string, date = '2026-10-10') => ({ title, date, module: 'RETURNS', priority: 'HIGH' });

describe('Compliance calendar scope and recovery', () => {
  for (const field of ['month', 'selectedBranchId', 'module']) {
    it('keeps the newest response after switching ' + field, () => {
      const f = calendar(); f.c.reload();
      f.c[field] = field === 'month' ? '2026-11' : field === 'module' ? 'RETURNS' : 'TEST-B';
      f.c.reload(); f.reads[1].next({ items: [item('NEW')] });
      f.reads[0].next({ items: [item('OLD')] });
      expect(f.c.allItems[0].title).toBe('NEW'); f.c.ngOnDestroy();
    });
  }
  it('does not stop the new spinner or show an old error', () => {
    const f = calendar(); f.c.reload(); f.c.reload(); f.reads[0].error(Error('TEST'));
    expect(f.c.loading).toBe(true); expect(f.c.loadError).toBe(''); f.c.ngOnDestroy();
  });
  it('shows failure separately from an empty result and recovers', () => {
    const f = calendar(); f.c.reload(); f.reads[0].error(Error('TEST'));
    expect(f.c.loadError).toBeTruthy(); expect(f.c.loading).toBe(false);
    f.c.reload(); f.reads[1].next({ items: [] }); expect(f.c.loadError).toBe('');
    expect(f.c.days).toHaveLength(31); f.c.ngOnDestroy();
  });
  it('clears the old results while loading a different scope', () => {
    const f = calendar(); f.c.reload(); f.reads[0].next({ items: [item('OLD')] });
    f.c.selectedBranchId = 'TEST-B'; f.c.reload();
    expect(f.c.allItems).toEqual([]); expect(f.c.days).toEqual([]); f.c.ngOnDestroy();
  });
  it('ignores old CRM branch lists and deadlines after switching client', () => {
    const f = calendar('CRM'); f.c.selectedClientId = 'TEST-A'; f.c.onClientChange();
    f.c.selectedClientId = 'TEST-B'; f.c.onClientChange();
    f.branches[1].next([{ id: 'TEST-B-BRANCH', branchName: 'B' }]);
    f.reads[1].next({ items: [item('B')] });
    f.branches[0].next([{ id: 'TEST-A-BRANCH', branchName: 'A' }]);
    f.reads[0].next({ items: [item('A')] });
    expect(f.c.branches[0].id).toBe('TEST-B-BRANCH'); expect(f.c.allItems[0].title).toBe('B');
    f.c.ngOnDestroy();
  });
  it('never issues an unscoped CRM calendar request', () => {
    const f = calendar('CRM'); f.c.reload();
    expect(f.api.getCalendar).not.toHaveBeenCalled(); f.c.ngOnDestroy();
  });
  for (const month of ['', '2026-13', 'bad']) {
    it('rejects invalid month ' + month, () => {
      const f = calendar(); f.c.month = month; f.c.reload();
      expect(f.api.getCalendar).not.toHaveBeenCalled(); expect(f.c.loadError).toBeTruthy();
      f.c.ngOnDestroy();
    });
  }
  it('keeps branch users scoped and supplies leap-year date boundaries', () => {
    const f = calendar('CLIENT', ['TEST-BRANCH']); f.c.ngOnInit();
    expect(f.api.getCalendar.mock.calls[0][0].branchId).toBe('TEST-BRANCH');
    f.c.month = '2024-02'; f.c.reload();
    expect(f.api.getCalendar.mock.lastCall?.[0]).toMatchObject({ from: '2024-02-01', to: '2024-02-29' });
    f.c.ngOnDestroy(); expect(f.reads.every(s => !s.observed)).toBe(true);
  });
  it('cancels previous CRM scope reads when the client selection becomes empty', () => {
    const f = calendar('CRM'); f.c.selectedClientId = 'TEST-A'; f.c.onClientChange();
    f.c.selectedClientId = ''; f.c.onClientChange();
    f.branches[0].next([{ id: 'OLD' }]); f.reads[0].next({ items: [item('OLD')] });
    expect(f.c.branches).toEqual([]); expect(f.c.allItems).toEqual([]);
    expect(f.api.getCalendar).toHaveBeenCalledTimes(1); f.c.ngOnDestroy();
  });
  it('retries a failed CRM branch selector without resetting a newer branch or calendar', () => {
    const f = calendar('CRM'); f.c.selectedClientId = 'TEST-A'; f.c.onClientChange();
    f.branches[0].error(Error('TEST')); f.reads[0].next({ items: [item('CURRENT')] });
    f.c.selectedBranchId = 'TEST-B'; f.c.retryScopeOptions();
    f.branches[1].next([{ id: 'TEST-B', branchName: 'B' }]);
    expect(f.c.selectedBranchId).toBe('TEST-B'); expect(f.c.branchLoadError).toBe('');
    expect(f.c.allItems[0].title).toBe('CURRENT'); expect(f.api.getCalendar).toHaveBeenCalledTimes(1);
    f.c.ngOnDestroy();
  });
  it('retries failed master branch options before declaring an empty calendar', () => {
    const f = calendar(); f.c.ngOnInit(); f.branches[0].error(Error('TEST'));
    expect(f.c.branchLoadError).toBeTruthy(); expect(f.c.calendarLoaded).toBe(false);
    f.c.retryScopeOptions(); f.branches[1].next([]);
    f.reads[0].next({ items: [] }); expect(f.c.calendarLoaded).toBe(true); f.c.ngOnDestroy();
  });
  it('preserves an explicit all-assigned-branches selection when retrying names', () => {
    const f = calendar('CLIENT', ['TEST-A', 'TEST-B']); f.c.ngOnInit();
    f.c.selectedBranchId = ''; f.branches[0].error(Error('TEST'));
    f.c.retryScopeOptions(); expect(f.c.selectedBranchId).toBe('');
    expect(f.api.getCalendar.mock.lastCall?.[0].branchId).toBeUndefined(); f.c.ngOnDestroy();
  });
  it('shows a client-list failure without fetching an unscoped calendar', () => {
    const f = calendar('CRM'); f.c.ngOnInit();
    f.clients.error(Error('TEST')); expect(f.c.clientLoadError).toBeTruthy();
    expect(f.api.getCalendar).not.toHaveBeenCalled(); f.c.ngOnDestroy();
  });
  it('keeps older errors from replacing a successful current calendar', () => {
    const f = calendar(); f.c.reload(); f.c.reload(); f.reads[1].next({ items: [item('CURRENT')] });
    f.reads[0].error(Error('TEST')); expect(f.c.loadError).toBe('');
    expect(f.c.calendarLoaded).toBe(true); expect(f.c.allItems[0].title).toBe('CURRENT'); f.c.ngOnDestroy();
  });
});

describe('Compliance reminders scope and recovery', () => {
  function fixture() {
    const reads: Subject<any>[] = [];
    const getReminders = vi.fn(() => { const s = new Subject<any>(); reads.push(s); return s; });
    const c: any = new ClientComplianceRemindersComponent({ getReminders } as any, {} as any, { markForCheck: vi.fn() } as any);
    return { c, reads };
  }
  it('does not show a previous branch response after switching', () => {
    const f = fixture(); f.c.loadReminders(); f.c.selectedBranchId = 'TEST-B'; f.c.loadReminders();
    f.reads[1].next([{ title: 'B' }]); f.reads[0].next([{ title: 'A' }]);
    expect(f.c.reminders[0].title).toBe('B'); f.c.ngOnDestroy();
  });
  it('distinguishes an outage from no deadlines and supports retry', () => {
    const f = fixture(); f.c.loadReminders(); f.reads[0].error(Error('TEST'));
    expect(f.c.loadError).toBeTruthy(); f.c.loadReminders(); f.reads[1].next([]);
    expect(f.c.loadError).toBe(''); expect(f.c.reminders).toEqual([]); f.c.ngOnDestroy();
  });
});
