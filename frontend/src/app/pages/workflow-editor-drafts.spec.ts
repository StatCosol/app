import '@angular/compiler';
import { Subject, of } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { ContractorClraWorkspaceComponent } from './contractor/clra/contractor-clra-workspace.component';
import { AuditorObservationsComponent } from './auditor/observations/auditor-observations.component';

function workerFixture() {
  const pending = new Subject<any>();
  const api = { createMyWorker: vi.fn(() => pending), updateMyWorker: vi.fn(() => of({})), listMyWorkers: vi.fn(() => of([])) };
  const toast = { success: vi.fn(), error: vi.fn() };
  const c = new ContractorClraWorkspaceComponent(api as any, toast as any, { markForCheck() {} } as any);
  c.openWorkerForm(); c.workerForm.workerCode = 'TEST-A'; c.workerForm.fullName = 'Synthetic A';
  return { c, api, pending, toast };
}
function auditorFixture() {
  const pending = new Subject<any>();
  const a = { id: 'TEST-A', auditId: 'TEST-AUDIT', status: 'OPEN', recommendation: 'Stored A', elaboration: 'Stored response A' };
  const b = { id: 'TEST-B', auditId: 'TEST-AUDIT', status: 'OPEN', recommendation: 'Stored B', elaboration: 'Stored response B' };
  const api = { update: vi.fn(() => pending), list: vi.fn(() => of([a, b])) };
  const c = new AuditorObservationsComponent(api as any, {} as any, {} as any, { success() {}, error() {}, warning() {} } as any, { markForCheck() {} } as any, {} as any);
  c.loading = false; c.filterAuditId = 'TEST-AUDIT'; c.observations = [a, b]; c.selectObservation(a);
  return { c, api, pending, a, b };
}
describe('Contractor worker save drafts', () => {
  it('preserves a different worker editor opened during an earlier save', () => {
    const { c, pending } = workerFixture(); c.saveWorker(); c.closeWorkerForm(); c.openWorkerForm();
    c.workerForm.workerCode = 'TEST-B'; c.workerForm.fullName = 'Unsaved synthetic B';
    pending.next({ id: 'SAVED-A' }); pending.complete();
    expect(c.showWorkerForm).toBe(true); expect(c.workerForm.workerCode).toBe('TEST-B'); expect(c.workerForm.id).toBeUndefined(); c.ngOnDestroy();
  });
  it('preserves later edits and retains the created ID so retry updates the saved worker', () => {
    const { c, api, pending } = workerFixture(); c.saveWorker(); c.workerForm.fullName = 'Newer synthetic name';
    pending.next({ id: 'SAVED-A' }); pending.complete();
    expect(c.showWorkerForm).toBe(true); expect(c.workerForm.fullName).toBe('Newer synthetic name'); expect(c.workerForm.id).toBe('SAVED-A');
    c.saveWorker(); expect(api.createMyWorker).toHaveBeenCalledTimes(1);
    expect(api.updateMyWorker).toHaveBeenCalledWith('SAVED-A', expect.objectContaining({ fullName: 'Newer synthetic name' })); c.ngOnDestroy();
  });
  it('closes an unchanged editor after success and blocks duplicate submit', () => {
    const { c, api, pending } = workerFixture(); c.saveWorker(); c.saveWorker(); pending.next({ id: 'SAVED-A' }); pending.complete();
    expect(api.createMyWorker).toHaveBeenCalledTimes(1); expect(c.showWorkerForm).toBe(false); c.ngOnDestroy();
  });
  it('does not refresh or toast from a pending save after the workspace is destroyed', () => {
    const { c, api, pending, toast } = workerFixture(); c.saveWorker(); c.ngOnDestroy(); pending.next({ id: 'SAVED-A' });
    expect(api.listMyWorkers).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
  });
  it('keeps the newer worker draft editable after a failed save', () => {
    const { c, pending, toast } = workerFixture(); c.saveWorker(); c.workerForm.fullName = 'Unsaved newer name';
    pending.error(new Error('Synthetic failure'));
    expect(c.showWorkerForm).toBe(true); expect(c.workerForm.fullName).toBe('Unsaved newer name');
    expect(c.workerForm.id).toBeUndefined(); expect(c.saving).toBe(false); expect(toast.error).toHaveBeenCalled(); c.ngOnDestroy();
  });
});
describe('Auditor CAPA save drafts', () => {
  it('preserves later text while applying only unchanged fields from the saved response', () => {
    const { c, pending, a } = auditorFixture(); c.capaDraft = 'Submitted A'; c.branchResponseDraft = 'Submitted response';
    c.saveCapaDetails(); c.capaDraft = 'UNSAVED newer A'; c.verificationNotes = 'UNSAVED verification';
    pending.next({ ...a, recommendation: 'Submitted A', elaboration: 'Normalized response' }); pending.complete();
    expect(c.capaDraft).toBe('UNSAVED newer A'); expect(c.branchResponseDraft).toBe('Normalized response');
    expect(c.verificationNotes).toBe('UNSAVED verification'); expect(c.selected.recommendation).toBe('Submitted A'); c.ngOnDestroy();
  });
  it('preserves another selected observation and its dirty draft when the first save finishes', () => {
    const { c, api, pending, a, b } = auditorFixture(); c.capaDraft = 'Submitted A'; c.saveCapaDetails();
    c.selectObservation(b); c.capaDraft = 'UNSAVED B'; pending.next({ ...a, recommendation: 'Submitted A' }); pending.complete();
    expect(c.selected.id).toBe(b.id); expect(c.capaDraft).toBe('UNSAVED B'); expect(api.list).not.toHaveBeenCalled();
    expect(c.observations.find(row => row.id === a.id).recommendation).toBe('Submitted A'); c.ngOnDestroy();
  });
  it('does not hydrate a reopened editor instance with an earlier save callback', () => {
    const { c, pending, a, b } = auditorFixture(); c.saveCapaDetails();
    c.selectObservation(b); c.selectObservation(a); c.capaDraft = 'UNSAVED reopened A';
    pending.next({ ...a, recommendation: 'Earlier saved A' }); pending.complete();
    expect(c.capaDraft).toBe('UNSAVED reopened A'); c.ngOnDestroy();
  });
  it('does not update a newly loaded audit scope from an old save response', () => {
    const { c, api, pending, a } = auditorFixture(); c.saveCapaDetails();
    const other = { id: 'OTHER', auditId: 'OTHER-AUDIT', status: 'OPEN', recommendation: 'Stored other' };
    api.list.mockReturnValue(of([other]) as any); c.filterAuditId = 'OTHER-AUDIT'; c.loadObservations(); c.capaDraft = 'UNSAVED other';
    pending.next({ ...a, recommendation: 'Earlier saved A' }); pending.complete();
    expect(c.selected.id).toBe('OTHER'); expect(c.capaDraft).toBe('UNSAVED other');
    expect(api.list).toHaveBeenCalledTimes(1); expect(c.observations).toEqual([other]); c.ngOnDestroy();
  });
  it('keeps dirty CAPA and response fields after a failed save', () => {
    const { c, pending, a } = auditorFixture(); c.saveCapaDetails();
    c.capaDraft = 'Unsaved newer CAPA'; c.branchResponseDraft = 'Unsaved response';
    pending.error(new Error('Synthetic failure'));
    expect(c.selected.id).toBe(a.id); expect(c.capaDraft).toBe('Unsaved newer CAPA');
    expect(c.branchResponseDraft).toBe('Unsaved response'); expect(c.busy).toBe(false); c.ngOnDestroy();
  });
});
