import '@angular/compiler';
import { Subject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ClientRegistrationsComponent } from './client/compliance/client-registrations.component';
import { BranchRegistrationsComponent } from './branch/branch-registrations/branch-registrations.component';

const registration = (id: string, computedStatus = 'ACTIVE') => ({ id, type: 'TEST ONLY License', computedStatus });
const ticket = (id: string) => ({ id, subCategory: 'REGISTRATION_APPLY', status: 'OPEN', description: '[REGISTRATION_REQUEST]\nAction: APPLY\nRegistration Type: TEST ONLY' });

function clientFixture() {
  const reads: Subject<any[]>[] = [];
  const api = { listRegistrations: vi.fn(() => { const read = new Subject<any[]>(); reads.push(read); return read; }) };
  const c = new ClientRegistrationsComponent(api as any, {} as any, { markForCheck() {} } as any);
  return { c, reads, api };
}
function branchFixture() {
  const refresh = new Subject<any[]>();
  const helpdesk = {
    createTicket: vi.fn(() => of({ id: 'TEST-TICKET' })),
    listTickets: vi.fn().mockReturnValueOnce(refresh).mockImplementation(() => of([])),
  };
  const api = { listRegistrations: vi.fn(() => of([])), getRegistrationAlerts: vi.fn(() => of([])) };
  const toast = { success: vi.fn(), error: vi.fn() };
  const c = new BranchRegistrationsComponent({} as any, api as any, helpdesk as any, toast as any, { markForCheck() {} } as any, {} as any);
  return { c, refresh, helpdesk, api, toast };
}

describe('Client registration branch refresh', () => {
  it('keeps branch B rows and counts when branch A finishes later', () => {
    const { c, reads } = clientFixture();
    c.selectedBranchId = 'A'; c.load(); c.selectedBranchId = 'B'; c.load();
    reads[1].next([registration('TEST-B', 'EXPIRED')]); reads[0].next([registration('TEST-A')]);
    expect(c.registrations.map(row => row.id)).toEqual(['TEST-B']);
    expect([c.active, c.expiring, c.expired]).toEqual([0, 0, 1]);
    expect(c.loading).toBe(false); c.ngOnDestroy();
  });
  it('clears old branch counts while loading and when the new read fails', () => {
    const { c, reads } = clientFixture();
    c.selectedBranchId = 'A'; c.load(); reads[0].next([registration('TEST-A')]);
    c.selectedBranchId = 'B'; c.load();
    expect(c.registrations).toEqual([]); expect(c.active).toBe(0);
    reads[1].error(new Error('Synthetic failure'));
    expect([c.active, c.expiring, c.expired]).toEqual([0, 0, 0]);
    expect(c.filtered).toEqual([]); expect(c.error).toContain('Failed'); c.ngOnDestroy();
  });
  it('ignores an old error after the current branch succeeds', () => {
    const { c, reads } = clientFixture();
    c.selectedBranchId = 'A'; c.load(); c.selectedBranchId = 'B'; c.load();
    reads[1].next([registration('TEST-B')]); reads[0].error(new Error('Old synthetic failure'));
    expect(c.error).toBeNull(); expect(c.registrations[0].id).toBe('TEST-B'); c.ngOnDestroy();
  });
  it('keeps only the latest refresh of the same branch', () => {
    const { c, reads } = clientFixture();
    c.selectedBranchId = 'A'; c.load(); c.load();
    reads[1].next([registration('NEW')]); reads[0].next([registration('OLD')]);
    expect(c.registrations[0].id).toBe('NEW'); c.ngOnDestroy();
  });
  it('clears the workspace and cancels reads if branch selection becomes empty', () => {
    const { c, reads } = clientFixture();
    c.selectedBranchId = 'A'; c.load(); reads[0].next([registration('TEST-A')]);
    c.selectedBranchId = ''; c.load(); reads[0].next([registration('OLD')]);
    expect(c.registrations).toEqual([]); expect(c.active).toBe(0);
    expect(c.loading).toBe(false); c.ngOnDestroy();
  });
});

describe('Branch registration request refresh', () => {
  it('blocks summary export during a pending refresh and after failure', () => {
    const { c, refresh, toast } = branchFixture();
    const reg = registration('TEST-REG') as any;
    c.branchId = 'A'; c.registrations = [reg]; c.filteredRegistrations = [reg]; c.selectedRegistration = reg;
    const createUrl = vi.spyOn(URL, 'createObjectURL');
    (c as any).loadRequests(reg.id);
    expect(c.requestHistoryLoading).toBe(true);
    c.exportSelectedSummary();
    refresh.error(new Error('Synthetic history failure'));
    expect(c.requestHistoryLoading).toBe(false);
    c.exportSelectedSummary();
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(createUrl).not.toHaveBeenCalled();
    createUrl.mockRestore(); c.ngOnDestroy();
  });
  it('retains history errors while a scoped retry is pending and ignores its old result after branch switching', () => {
    const { c, refresh, helpdesk, api } = branchFixture();
    c.branchId = 'A'; c.loading = false;
    (c as any).loadRequests(null); refresh.error(new Error('Synthetic history failure'));
    const retry = new Subject<any[]>(); helpdesk.listTickets.mockReturnValueOnce(retry);
    c.retryRequestHistory(); c.retryRequestHistory();
    expect(helpdesk.listTickets).toHaveBeenCalledTimes(2);
    expect(api.listRegistrations).not.toHaveBeenCalled();
    expect(c.requestLoadError).toContain('could not be refreshed');
    expect(c.requestHistoryLoading).toBe(true);
    c.branchId = 'B'; c.changeBranch(); retry.next([ticket('OLD-A')]);
    expect(c.requestHistoryLoading).toBe(false);
    expect(c.requestLoadError).toBe(''); expect(c.requests).toEqual([]); c.ngOnDestroy();
  });
  it('reports unavailable request history after a current refresh error while retaining registrations', () => {
    const { c, refresh } = branchFixture();
    const reg = registration('TEST-REG') as any;
    c.branchId = 'A'; c.registrations = [reg]; c.filteredRegistrations = [reg];
    c.selectedRegistration = reg; c.requests = [ticket('OLD') as any];
    c.selectedRequests = c.requests; c.selectedTimeline = [{ id: 'OLD', title: 'Old request' }] as any;
    (c as any).loadRequests(reg.id); refresh.error(new Error('Synthetic unavailable'));
    expect(c.registrations).toEqual([reg]); expect(c.requests).toEqual([]);
    expect(c.selectedRequests).toEqual([]); expect(c.selectedTimeline).toEqual([]);
    expect(c.requestLoadError).toContain('could not be refreshed');
    c.loadWorkspace(); expect(c.requestLoadError).toBe(''); c.ngOnDestroy();
  });
  it('ignores an old request error after the selected branch changes', () => {
    const { c, refresh } = branchFixture();
    c.branchId = 'A'; (c as any).loadRequests(null); c.branchId = 'B'; c.changeBranch();
    refresh.error(new Error('Old synthetic unavailable'));
    expect(c.requestLoadError).toBe(''); expect(c.requests).toEqual([]); c.ngOnDestroy();
  });
  it('does not display branch A post-save requests after switching to B', () => {
    const { c, refresh, helpdesk } = branchFixture();
    c.branchId = 'A'; c.openRequestModal('APPLY'); c.requestModel.registrationType = 'TEST ONLY';
    c.submitRequest(); expect(c.requestSaving).toBe(false);
    expect(helpdesk.createTicket).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'A' }));
    c.branchId = 'B'; c.changeBranch(); refresh.next([ticket('TEST-A-TICKET')]);
    expect(c.requests).toEqual([]); expect(c.openRequestCount).toBe(0); c.ngOnDestroy();
  });
  it('cancels the old request refresh when reloading the same branch workspace', () => {
    const { c, refresh } = branchFixture();
    c.branchId = 'A'; (c as any).loadRequests(null);
    c.loadWorkspace(); refresh.next([ticket('OLD')]);
    expect(c.requests).toEqual([]); expect(c.openRequestCount).toBe(0); c.ngOnDestroy();
  });
  it('does not revive the first A response after A to B to A navigation', () => {
    const { c, refresh } = branchFixture();
    c.branchId = 'A'; (c as any).loadRequests(null);
    c.branchId = 'B'; c.changeBranch(); c.branchId = 'A'; c.changeBranch();
    refresh.next([ticket('OLD-A')]);
    expect(c.requests).toEqual([]); expect(c.openRequestCount).toBe(0); c.ngOnDestroy();
  });
});
