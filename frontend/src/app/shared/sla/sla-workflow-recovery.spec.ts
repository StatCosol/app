import '@angular/compiler';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SlaTrackerComponent } from './sla-tracker.component';

function fixture(role = 'CLIENT', mapped: string[] = []) {
  const reads: Subject<any>[] = [], branches: Subject<any>[] = [], clients: Subject<any>[] = [], writes: Subject<any>[] = [];
  const request = (list: Subject<any>[]) => { const s = new Subject<any>(); list.push(s); return s; };
  const api = { list: vi.fn(() => request(branches)), getSlaTasks: vi.fn((_p: any) => request(reads)), updateSlaTask: vi.fn((_id: string, _p: any) => request(writes)) };
  const crm = { getAssignedClients: () => request(clients), getBranchesForClient: vi.fn((_id: string) => request(branches)) };
  const admin = { getAdminClients: () => request(clients), getBranchesForAdminClient: vi.fn((_id: string) => request(branches)) };
  const c: any = new (SlaTrackerComponent as any)(api, { getRoleCode: () => role, getBranchIds: () => mapped }, { markForCheck: vi.fn() }, crm, admin);
  c.branchId = 'TEST-A';
  return { c, api, crm, admin, reads, branches, clients, writes };
}
const task = (id = 'TEST-A', status = 'OPEN') => ({ id, title: id, status, module: 'RETURNS', dueDate: '2026-11-30' });
const populate = (f: ReturnType<typeof fixture>) => { f.c.load(); f.reads.at(-1)!.next({ items: [task()] }); };

describe('SLA tracker scope and status workflows', () => {
  for (const field of ['branchId', 'module', 'status']) {
    it('keeps the current tasks after changing ' + field, () => {
      const f = fixture(); f.c.load(); f.c[field] = field === 'branchId' ? 'TEST-B' : field === 'module' ? 'RETURNS' : 'CLOSED'; f.c.load();
      f.reads[1].next({ items: [task('TEST-CURRENT')] }); f.reads[0].next({ items: [task('TEST-OLD')] });
      expect(f.c.items[0].id).toBe('TEST-CURRENT');
    });
  }
  it('clears old rows and does not let an old failure stop the new loading state', () => {
    const f = fixture(); populate(f); f.c.load(); expect(f.c.items).toEqual([]);
    f.c.branchId = 'TEST-B'; f.c.load(); f.reads[1].error(Error('old'));
    expect(f.c.loading).toBe(true); expect(f.c.loadError).toBe('');
  });
  it('distinguishes failed reads from no tasks and retries', () => {
    const f = fixture(); f.c.load(); f.reads[0].error(Error('offline'));
    expect(f.c.loadError).toBeTruthy(); expect(f.c.tasksLoaded).toBe(false);
    f.c.load(); f.reads[1].next({ items: [] }); expect(f.c.loadError).toBe(''); expect(f.c.tasksLoaded).toBe(true);
  });
  it('does not send an unscoped task request when no branch is available', () => {
    const f = fixture(); f.c.ngOnInit(); f.branches[0].next([]);
    expect(f.api.getSlaTasks).not.toHaveBeenCalled(); expect(f.c.branchId).toBe('');
  });
  it('uses CRM client and branch options and ignores an old client response', () => {
    const f = fixture('CRM'); f.c.ngOnInit(); expect(f.api.list).not.toHaveBeenCalled();
    f.clients[0].next([{ id: 'TEST-C1' }, { id: 'TEST-C2' }]);
    f.c.clientId = 'TEST-C2'; f.c.onClientChange();
    f.branches[1].next([{ id: 'TEST-B2' }]); f.branches[0].next([{ id: 'TEST-B1' }]);
    expect(f.c.branchId).toBe('TEST-B2'); expect(f.api.getSlaTasks.mock.lastCall?.[0]).toMatchObject({ branchId: 'TEST-B2', clientId: 'TEST-C2' });
  });
  it('clearing the client cancels pending tasks and branches', () => {
    const f = fixture('CRM'); f.c.showClientPicker = true; f.c.clientId = 'TEST-C1'; f.c.onClientChange();
    f.branches[0].next([{ id: 'TEST-B1' }]); f.c.clientId = ''; f.c.onClientChange();
    f.reads[0].next({ items: [task()] }); expect(f.c.items).toEqual([]); expect(f.c.branchId).toBe(''); expect(f.c.loading).toBe(false);
  });
  it('retries client option failures without making an unscoped task read', () => {
    const f = fixture('CRM'); f.c.ngOnInit(); f.clients[0].error(Error('offline'));
    expect(f.c.clientLoadError).toBeTruthy(); expect(f.api.getSlaTasks).not.toHaveBeenCalled();
    f.c.retryClients(); f.clients[1].next([{ id: 'TEST-C1' }]); expect(f.crm.getBranchesForClient).toHaveBeenCalledWith('TEST-C1');
  });
  it('retries branch loading and keeps a mapped user selection when resolving names', () => {
    const f = fixture('CLIENT', ['TEST-A', 'TEST-B']); f.c.ngOnInit();
    f.c.branchId = 'TEST-B'; f.c.load(); f.reads[1].next({ items: [task('TEST-B')] }); f.branches[0].error(Error('offline'));
    expect(f.c.branchLoadError).toBeTruthy(); f.c.retryBranches(); f.branches[1].next([{ id: 'TEST-A' }, { id: 'TEST-B', name: 'B' }]);
    expect(f.c.branchId).toBe('TEST-B'); expect(f.c.items[0].id).toBe('TEST-B'); expect(f.reads).toHaveLength(2);
  });
  it('prevents duplicate or competing status actions for the same pending task', () => {
    const f = fixture(); populate(f); const row = f.c.items[0];
    f.c.setStatus(row, 'IN_PROGRESS'); f.c.setStatus(row, 'CLOSED');
    expect(f.api.updateSlaTask).toHaveBeenCalledTimes(1); expect(f.c.isSaving(row.id)).toBe(true);
  });
  it('requires a confirmed refresh after a failed save before allowing retry', () => {
    const f = fixture(); populate(f); const row = f.c.items[0]; f.c.setStatus(row, 'CLOSED'); f.writes[0].error(Error('offline'));
    expect(f.c.actionError).toBeTruthy(); expect(f.c.isSaving(row.id)).toBe(false); expect(row.status).toBe('OPEN');
    f.c.setStatus(row, 'CLOSED'); expect(f.api.updateSlaTask).toHaveBeenCalledTimes(1);
    f.c.load(); f.reads[1].next({ items: [task()] }); f.c.setStatus(f.c.items[0], 'CLOSED'); expect(f.api.updateSlaTask).toHaveBeenCalledTimes(2);
  });
  it('does not reopen a task when the close saved but its response was lost', () => {
    const f = fixture(); populate(f); f.c.setStatus(f.c.items[0], 'CLOSED'); f.writes[0].error(Error('response lost'));
    f.c.setStatus(f.c.items[0], 'IN_PROGRESS'); expect(f.api.updateSlaTask).toHaveBeenCalledTimes(1);
    f.c.load(); f.reads[1].next({ items: [task('TEST-A', 'CLOSED')] });
    f.c.setStatus(f.c.items[0], 'IN_PROGRESS'); expect(f.api.updateSlaTask).toHaveBeenCalledTimes(1);
  });
  it('does not confirm an uncertain save using a read started before its failure', () => {
    const f = fixture(); populate(f); f.c.setStatus(f.c.items[0], 'CLOSED');
    f.c.module = 'RETURNS'; f.c.load(); f.writes[0].error(Error('response lost'));
    f.reads[1].next({ items: [task()] }); expect(f.c.items).toEqual([]); expect(f.c.tasksLoaded).toBe(false);
    expect(f.c.loadError).toContain('confirm'); f.c.load(); f.reads[2].next({ items: [task('TEST-A', 'CLOSED')] });
    expect(f.c.items[0].status).toBe('CLOSED');
  });
  it('refreshes the latest filters after a completed save, without restoring the old filter', () => {
    const f = fixture(); populate(f); f.c.setStatus(f.c.items[0], 'CLOSED');
    f.c.status = 'CLOSED'; f.c.load(); f.writes[0].next({ ...task(), status: 'CLOSED' });
    expect(f.api.getSlaTasks.mock.lastCall?.[0].status).toBe('CLOSED');
    f.reads.at(-1)!.next({ items: [task('TEST-A', 'CLOSED')] }); f.reads[1].next({ items: [task('TEST-OLD')] });
    expect(f.c.items[0].status).toBe('CLOSED'); expect(f.c.isSaving('TEST-A')).toBe(false);
  });
  it('does not display an action error from a previous branch under the new branch', () => {
    const f = fixture(); populate(f); f.c.setStatus(f.c.items[0], 'CLOSED'); f.c.branchId = 'TEST-B'; f.c.load();
    f.writes[0].error(Error('old')); expect(f.c.actionError).toBe(''); expect(f.c.loading).toBe(true);
  });
  for (const kind of ['stale', 'closed', 'unsupported']) {
    it('does not send a status update for ' + kind + ' actions', () => {
      const f = fixture(); populate(f);
      const row = kind === 'stale' ? task('TEST-STALE') : f.c.items[0]; if (kind === 'closed') row.status = 'CLOSED';
      f.c.setStatus(row, kind === 'unsupported' ? 'OVERDUE' : 'IN_PROGRESS'); expect(f.api.updateSlaTask).not.toHaveBeenCalled();
    });
  }
  it('removes a task from the open list after a successful close and reload', () => {
    const f = fixture(); populate(f); f.c.setStatus(f.c.items[0], 'CLOSED'); f.writes[0].next(task('TEST-A', 'CLOSED'));
    f.reads[1].next({ items: [] }); expect(f.c.items).toEqual([]); expect(f.c.tasksLoaded).toBe(true);
  });
  it('cancels outstanding reads and callbacks on destruction', () => {
    const f = fixture('CLIENT', ['TEST-A']); f.c.ngOnInit(); f.reads[0].next({ items: [task()] }); f.c.setStatus(f.c.items[0], 'CLOSED');
    f.c.ngOnDestroy(); expect([...f.reads, ...f.branches, ...f.writes].every(s => !s.observed)).toBe(true);
  });
  it('keeps overdue tasks in progress without offering the same transition again', () => {
    const f = fixture(); f.c.load(); f.reads[0].next({ items: [{ ...task('TEST-A', 'OVERDUE'), workflowStatus: 'IN_PROGRESS' }] });
    f.c.setStatus(f.c.items[0], 'IN_PROGRESS'); expect(f.api.updateSlaTask).not.toHaveBeenCalled();
    f.c.setStatus(f.c.items[0], 'CLOSED'); expect(f.api.updateSlaTask).toHaveBeenCalledWith('TEST-A', { status: 'CLOSED' });
  });
});
