import '@angular/compiler';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { describe, it, expect, vi } from 'vitest';
import { ClientAppraisalApproveComponent } from './client-appraisal-approve.component';
import { BranchAppraisalFormComponent } from '../../branch/performance-appraisal/branch-appraisal-form.component';

const record = (id: string, status = 'BRANCH_REVIEWED'): any => ({
  id, status, employee_name: `Synthetic ${id}`, employee_code: id,
  items: [{ id: `${id}-ITEM`, itemName: 'Synthetic criterion', weightage: 100,
    managerRating: 3, branchRating: 4, managerRemarks: 'Manager note', branchRemarks: 'Branch note' }],
  recommendation: 'INCREMENT', recommendedIncrementPercent: 5, recommendedNewCtc: 200,
  finalRemarks: 'Saved synthetic remark', approvals: [],
});

export function appraisalFixture(kind: 'Client' | 'Branch') {
  const status = kind === 'Client' ? 'BRANCH_REVIEWED' : 'SELF_SUBMITTED';
  const route = new BehaviorSubject(convertToParamMap({ id: 'TEST-A' }));
  const pending = new Subject<any>(), second = new Subject<any>();
  const svc = { getAppraisal: vi.fn((id: string) => of(record(id, status))),
    clientApprove: vi.fn(() => pending), managerReview: vi.fn(() => pending),
    branchReview: vi.fn(() => pending), sendBack: vi.fn(() => pending), lockAppraisal: vi.fn(() => pending) };
  const router = { navigate: vi.fn() }, cdr = { markForCheck: vi.fn() };
  const component: any = kind === 'Client'
    ? new ClientAppraisalApproveComponent(svc as any, { paramMap: route } as any, router as any, cdr as any)
    : new BranchAppraisalFormComponent(svc as any, { paramMap: route } as any, router as any, cdr as any);
  component.ngOnInit();
  const switchTo = (id: string) => route.next(convertToParamMap({ id }));
  const act = () => kind === 'Client' ? component.approve() : component.submitReview();
  const setNote = (value: string) => { if (kind === 'Client') component.clientRemarks = value; else component.remarks = value; };
  const note = () => kind === 'Client' ? component.clientRemarks : component.remarks;
  return { c: component, svc, router, cdr, route, pending, second, switchTo, act, setNote, note, status };
}

describe.each(['Client', 'Branch'] as const)('%s appraisal request context', kind => {
  it('does not replace employee B or its draft with employee A save response', () => {
    const f = appraisalFixture(kind); f.act(); f.switchTo('TEST-B'); f.setNote('Unsaved B');
    f.pending.next(record('TEST-A', 'CLIENT_APPROVED')); f.pending.complete();
    expect(f.c.appraisal.id).toBe('TEST-B'); expect(f.note()).toBe('Unsaved B'); f.c.ngOnDestroy();
  });
  it('does not display the previous employee save error in the new review', () => {
    const f = appraisalFixture(kind); f.act(); f.switchTo('TEST-B'); f.pending.error(new Error('Synthetic failure'));
    expect(f.c.error).toBe(''); expect(f.c.appraisal.id).toBe('TEST-B'); f.c.ngOnDestroy();
  });
  it('allows B to save while A is pending and does not clear B busy state when A completes', () => {
    const f = appraisalFixture(kind); f.act(); f.switchTo('TEST-B');
    f.svc.clientApprove.mockReturnValue(f.second); f.svc.managerReview.mockReturnValue(f.second); f.act();
    expect(kind === 'Client' ? f.svc.clientApprove : f.svc.managerReview).toHaveBeenCalledTimes(2);
    f.pending.next(record('TEST-A')); f.pending.complete(); expect(f.c.submitting).toBe(true);
    f.second.next(record('TEST-B')); f.second.complete(); expect(f.c.submitting).toBe(false); f.c.ngOnDestroy();
  });
  it('preserves a failed review draft and permits retry', () => {
    const f = appraisalFixture(kind); f.setNote('Keep failed draft'); f.act(); f.pending.error(new Error('Synthetic failure'));
    expect(f.note()).toBe('Keep failed draft'); expect(f.c.error).toBeTruthy(); expect(f.c.submitting).toBe(false); f.c.ngOnDestroy();
  });
  it('prevents duplicate submission and refresh during an active save', () => {
    const f = appraisalFixture(kind); f.act(); f.act(); f.c.retry();
    expect(kind === 'Client' ? f.svc.clientApprove : f.svc.managerReview).toHaveBeenCalledTimes(1);
    expect(f.svc.getAppraisal).toHaveBeenCalledTimes(1); f.c.ngOnDestroy();
  });
  it('does not navigate away from B when sending A back finishes', () => {
    const f = appraisalFixture(kind); f.setNote('Synthetic send back'); f.c.sendBack(); f.switchTo('TEST-B');
    f.pending.next({}); f.pending.complete(); expect(f.router.navigate).not.toHaveBeenCalled(); f.c.ngOnDestroy();
  });
  it('refreshes A when returning to it before an older save completes', () => {
    const f = appraisalFixture(kind); f.act(); f.switchTo('TEST-B'); f.switchTo('TEST-A');
    expect(f.c.submitting).toBe(true); f.act();
    f.svc.getAppraisal.mockImplementation(id => of(record(id, 'CLIENT_APPROVED')));
    f.pending.next(record('TEST-A', 'MANAGER_REVIEWED')); f.pending.complete();
    expect(f.c.appraisal.status).toBe('CLIENT_APPROVED'); expect(f.svc.getAppraisal).toHaveBeenCalledTimes(4); f.c.ngOnDestroy();
  });
  it('ignores a cancelled older detail read and recovers from the current read failure', () => {
    const f = appraisalFixture(kind), old = new Subject<any>(), current = new Subject<any>();
    f.svc.getAppraisal.mockReturnValueOnce(old as any).mockReturnValueOnce(current as any);
    f.switchTo('TEST-OLD'); f.switchTo('TEST-CURRENT'); old.next(record('TEST-OLD')); old.complete();
    expect(f.c.appraisal).toBeNull(); expect(f.c.loading).toBe(true);
    current.error(new Error('Synthetic read failure')); expect(f.c.loading).toBe(false); expect(f.c.error).toBeTruthy();
    f.c.retry(); expect(f.c.appraisal.id).toBe('TEST-CURRENT'); f.c.ngOnDestroy();
  });
  it('refreshes a return to A even when its earlier detail read is still pending', () => {
    const f = appraisalFixture(kind), read = new Subject<any>(); f.act(); f.switchTo('TEST-B');
    f.svc.getAppraisal.mockReturnValueOnce(read as any); f.switchTo('TEST-A');
    f.svc.getAppraisal.mockImplementation(id => of(record(id, 'CLIENT_APPROVED')));
    f.pending.next(record('TEST-A')); f.pending.complete(); read.next(record('TEST-A')); read.complete();
    expect(f.c.appraisal.status).toBe('CLIENT_APPROVED'); expect(f.c.loading).toBe(false); f.c.ngOnDestroy();
  });
  it('does not render or navigate after destruction with a save pending', () => {
    const f = appraisalFixture(kind); f.setNote('Synthetic'); f.c.sendBack(); f.c.ngOnDestroy(); f.cdr.markForCheck.mockClear();
    f.pending.next({}); f.pending.complete(); expect(f.cdr.markForCheck).not.toHaveBeenCalled(); expect(f.router.navigate).not.toHaveBeenCalled();
  });
});

describe('Client appraisal stages', () => {
  it('does not carry client remarks into another employee', () => {
    const f = appraisalFixture('Client'); f.setNote('Private to A'); f.switchTo('TEST-B'); expect(f.note()).toBe(''); f.c.ngOnDestroy();
  });
  it('allows approval only after branch review, and lock only after client approval', () => {
    const f = appraisalFixture('Client');
    for (const status of ['INITIATED', 'SELF_SUBMITTED', 'MANAGER_REVIEWED', 'CLIENT_APPROVED', 'SENT_BACK', 'REJECTED', 'LOCKED']) {
      f.c.appraisal = record('TEST-A', status); expect(!!f.c.canApprove).toBe(false); f.c.approve(); f.c.reject();
    }
    expect(f.svc.clientApprove).not.toHaveBeenCalled();
    f.c.appraisal = record('TEST-A', 'BRANCH_REVIEWED'); f.c.lock(); expect(f.svc.lockAppraisal).not.toHaveBeenCalled();
    f.c.appraisal = record('TEST-A', 'CLIENT_APPROVED'); expect(f.c.canLock).toBe(true); f.c.lock(); expect(f.svc.lockAppraisal).toHaveBeenCalledWith('TEST-A'); f.c.ngOnDestroy();
  });
  it('requires send-back remarks and uses the supported send-back endpoint for an approved appraisal', () => {
    const f = appraisalFixture('Client'); f.c.appraisal = record('TEST-A', 'CLIENT_APPROVED');
    f.c.sendBack(); expect(f.svc.sendBack).not.toHaveBeenCalled(); expect(f.svc.clientApprove).not.toHaveBeenCalled();
    f.setNote('Recheck synthetic rating'); f.c.sendBack(); expect(f.svc.sendBack).toHaveBeenCalledWith('TEST-A', 'Recheck synthetic rating'); f.c.ngOnDestroy();
  });
  it('does not navigate away from B when the lock of A completes', () => {
    const f = appraisalFixture('Client'); f.c.appraisal = record('TEST-A', 'CLIENT_APPROVED'); f.c.lock(); f.switchTo('TEST-B');
    f.pending.next({}); f.pending.complete(); expect(f.router.navigate).not.toHaveBeenCalled(); f.c.ngOnDestroy();
  });
});

describe('Branch appraisal review stages and remarks', () => {
  it('sends branch remarks rather than manager remarks during branch review', () => {
    const f = appraisalFixture('Branch'); f.c.appraisal = record('TEST-A', 'MANAGER_REVIEWED'); f.c.items = f.c.appraisal.items;
    f.act(); expect(f.svc.branchReview).toHaveBeenCalledWith('TEST-A', expect.objectContaining({items: [expect.objectContaining({rating:4,remarks:'Branch note'})]})); f.c.ngOnDestroy();
  });
  it('sends manager remarks during manager review and never sends a locked review', () => {
    const f = appraisalFixture('Branch'); f.act(); expect(f.svc.managerReview).toHaveBeenCalledWith('TEST-A', expect.objectContaining({items:[expect.objectContaining({rating:3,remarks:'Manager note'})]}));
    f.pending.complete(); f.c.appraisal = record('TEST-A', 'LOCKED'); f.act(); expect(f.svc.branchReview).not.toHaveBeenCalled(); f.c.ngOnDestroy();
  });
  it('routes a sent-back review through the manager stage only', () => {
    const f = appraisalFixture('Branch'); f.c.appraisal = record('TEST-A', 'SENT_BACK');
    expect(!!f.c.canManagerReview).toBe(true); expect(!!f.c.canBranchReview).toBe(false); f.c.ngOnDestroy();
  });
});
