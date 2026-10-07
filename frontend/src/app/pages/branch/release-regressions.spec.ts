import { describe, it, expect, vi } from 'vitest';
import { of, throwError, Subject } from 'rxjs';
import { BranchMarkAttendanceComponent } from './branch-attendance/branch-mark-attendance.component';
import { EssDashboardComponent } from '../ess/dashboard/ess-dashboard.component';
import { BranchAuditObservationsComponent } from './branch-audit-observations/branch-audit-observations.component';
import { SalesLeadsListComponent } from '../sales/sales-leads-list.component';

describe('Release audit regressions', () => {
  const fail = () => throwError(() => new Error('offline'));
  const cdr = () => ({ markForCheck: vi.fn(), detectChanges: vi.fn() });
  it.each([0, 1, 2])('retains exactly the failed evidence files (%s successes)', successes => {
    const files = [new File(['one'], 'one.txt'), new File(['two'], 'two.txt')];
    const component: any = { selectedEvidenceFiles: files, selectedObservation: {id: 'observation'},
      helpdeskService: { uploadFile: (_: string, file: File) => files.indexOf(file) < successes ? of(null) : fail() },
      toast: {success: vi.fn(), error: vi.fn()}, refreshCases: vi.fn(), destroy$: new Subject<void>(), cdr: cdr() };
    (BranchAuditObservationsComponent.prototype as any).uploadEvidenceFiles.call(component, 'ticket');
    expect(component.selectedEvidenceFiles).toEqual(files.slice(successes));
    expect(component.toast.success).toHaveBeenCalledTimes(successes === 2 ? 1 : 0);
    expect(component.toast.error).toHaveBeenCalledTimes(successes === 2 ? 0 : 1);
  });
  it('keeps failed files when closure cases refresh and retries the same case', () => {
    const file = new File(['fixture'], 'failed.txt');
    const component: any = {selectedObservation: {id: 'observation'}, selectedEvidenceFiles: [file], failedEvidenceTicketId: 'ticket', cases: [], loadCaseMessages: vi.fn(), uploading: false};
    (BranchAuditObservationsComponent.prototype as any).selectObservation.call(component, {id: 'observation'});
    expect(component.selectedEvidenceFiles).toEqual([file]);
    component.uploadEvidenceFiles = vi.fn();
    BranchAuditObservationsComponent.prototype.retryEvidence.call(component);
    expect(component.uploadEvidenceFiles).toHaveBeenCalledWith('ticket');
    (BranchAuditObservationsComponent.prototype as any).selectObservation.call(component, {id: 'different'});
    expect(component.selectedEvidenceFiles).toEqual([]);
    expect(component.failedEvidenceTicketId).toBeNull();
  });
  it('blocks attendance saving when the attendance request fails', () => {
    const http = {get: vi.fn((url: string) => url.endsWith('/employees') ? of({data: [{id: 'e1'}], total: 1}) : fail()), post: vi.fn()};
    const toast = {error: vi.fn()};
    const component = new BranchMarkAttendanceComponent(http as any, toast as any, cdr() as any);
    component.load(); component.saveAll();
    expect(component.rows).toEqual([]);
    expect(component.loadedDate).toBeNull();
    expect(toast.error).toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });
  it('ignores an old attendance response after the date changes', () => {
    const old = new Subject<any>();
    const http = {get: vi.fn((url: string) => url.endsWith('/employees') ? of({data: [], total: 0}) : old)};
    const component = new BranchMarkAttendanceComponent(http as any, {error: vi.fn()} as any, cdr() as any);
    component.load(); component.selectedDate = '2026-01-01';
    old.next([]); old.complete();
    expect(component.loadedDate).toBeNull(); component.ngOnDestroy();
  });
  it('shows an error instead of empty ESS balances on a failed request', () => {
    const api = {getProfile: fail, getStatutory: fail, getContributions: fail, getLeaveBalances: fail, listLeaveApplications: fail, listNominations: fail, listPayslips: fail};
    const component = new EssDashboardComponent(api as any, cdr() as any);
    component.ngOnInit(); expect(component.errorMsg).toContain('Could not load'); component.ngOnDestroy();
  });
  it('opens the second sales page and resets pagination when filters are applied', () => {
    const svc = {list: vi.fn((_params: any) => of({items: [], total: 201}))};
    const component = new SalesLeadsListComponent(svc as any, cdr() as any);
    component.reload(2); expect(svc.list.mock.calls[0][0]).toMatchObject({offset: 200});
    component.search = 'sample'; component.reload();
    expect(svc.list.mock.calls[1][0]).toMatchObject({offset: 0, search: 'sample'});
  });
});
