import '@angular/compiler';
import { Subject, of } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { LeaveApprovalsComponent } from './leave-approvals.component';
import { NominationApprovalsComponent } from './nomination-approvals.component';
import { ClientUnifiedApprovalsComponent } from './client-unified-approvals.component';
import { BranchApprovalsApiService } from './branch-approvals-api.service';

const row = (id: string) => ({ id, employeeId: id, employeeName: `Synthetic ${id}`, leaveTypeCode: 'CL', fromDate: '2026-01-01', toDate: '2026-01-01', numberOfDays: 1, nominationType: 'EPF', status: 'PENDING' });
const cdr = () => ({ detectChanges: vi.fn(), markForCheck: vi.fn() });
const toast = () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() });

describe('Approval operations under the deployed /app/ base',()=>{
 for(const [method,suffix] of [
  ['listPendingLeaves','leaves'],['listPendingNominations','nominations'],
  ['approveLeave','leaves/TEST-ID/approve'],['rejectLeave','leaves/TEST-ID/reject'],
  ['approveNomination','nominations/TEST-ID/approve'],['rejectNomination','nominations/TEST-ID/reject'],
 ] as const) it(`${method} targets the API root rather than the SPA fallback`,()=>{
  const http={get:vi.fn(()=>of([])),put:vi.fn(()=>of({}))},api=new BranchApprovalsApiService(http as any);
  if(method==='listPendingLeaves') api.listPendingLeaves('TEST-BRANCH').subscribe();
  else if(method==='listPendingNominations') api.listPendingNominations('TEST-BRANCH').subscribe();
  else if(method==='rejectLeave'||method==='rejectNomination') api[method]('TEST-ID','Synthetic reason').subscribe();
  else api[method]('TEST-ID').subscribe();
  const args=(method.startsWith('list')?http.get:http.put).mock.calls[0] as any[];
  expect(new URL(args[0],'https://example.test/app/').pathname).toBe('/api/v1/branch-approvals/'+suffix);
  if(method.startsWith('list')) expect(args[1].params.branchId).toBe('TEST-BRANCH');
  else expect(args[1]).toEqual(method.startsWith('reject')?{reason:'Synthetic reason'}:{});
 });
});

describe.each(['leave', 'nomination'])('%s approval editor', kind => {
 function fixture() {
  const a=row('TEST-A'), b=row('TEST-B'), pending=new Subject<any>(), list=vi.fn(()=>of([a,b])), reject=vi.fn(()=>pending), approve=vi.fn(()=>pending), notices=toast(), detector=cdr();
  const api={ listPendingLeaves:list, listPendingNominations:list, rejectLeave:reject, rejectNomination:reject, approveLeave:approve, approveNomination:approve };
  const c:any=kind==='leave'?new LeaveApprovalsComponent(api as any,detector as any,notices as any):new NominationApprovalsComponent(api as any,detector as any,notices as any);
  c.load();
  return {c,a,b,pending,list,reject,approve,notices,detector,confirm:()=>kind==='leave'?c.confirmReject():c.confirmReject(a),rows:()=>kind==='leave'?c.leaves:c.nominations};
 }
 it('keeps a different rejection editor and its reason after the first request succeeds',()=>{
  const f=fixture();f.c.startReject(f.a);f.c.rejectReason='Submitted A';f.confirm();f.c.startReject(f.b);f.c.rejectReason='Unsaved B';f.pending.next({});f.pending.complete();
  expect(f.c.rejectId).toBe(f.b.id);expect(f.c.rejectReason).toBe('Unsaved B');expect(f.rows().map((r:any)=>r.id)).not.toContain(f.a.id);f.c.ngOnDestroy();
 });
 it('keeps the failed rejection reason available for retry',()=>{
  const f=fixture();f.c.startReject(f.a);f.c.rejectReason='Retry this reason';f.confirm();f.pending.error(new Error('Synthetic outage'));
  expect(f.c.rejectId).toBe(f.a.id);expect(f.c.rejectReason).toBe('Retry this reason');expect(f.c.processing.size).toBe(0);f.c.ngOnDestroy();
 });
 it('does not clear another request busy state when the first request finishes',()=>{
  const f=fixture(),second=new Subject<any>();f.c.startReject(f.a);f.c.rejectReason='A';f.confirm();f.reject.mockReturnValue(second);
  f.c.startReject(f.b);f.c.rejectReason='B';
  if(kind==='leave') f.c.confirmReject(); else f.c.confirmReject(f.b);
  f.pending.next({});f.pending.complete();expect(f.c.processing.has(f.b.id)).toBe(true);second.complete();f.c.ngOnDestroy();
 });
 it('rejects empty reasons and duplicate submissions before calling the API',()=>{
  const f=fixture();f.c.startReject(f.a);f.c.rejectReason='   ';f.confirm();expect(f.reject).not.toHaveBeenCalled();
  f.c.rejectReason='Valid';f.confirm();f.confirm();expect(f.reject).toHaveBeenCalledTimes(1);f.c.ngOnDestroy();
 });
 it('distinguishes a failed queue read from a successful empty queue and can retry',()=>{
  const f=fixture(),read=new Subject<any>();f.list.mockReturnValue(read as any);f.c.load();read.error(new Error('Synthetic outage'));
  expect(f.c.loadError).toBeTruthy();expect(f.c.loading).toBe(false);f.list.mockReturnValue(of([]));f.c.load();expect(f.c.loadError).toBe('');expect(f.rows()).toEqual([]);f.c.ngOnDestroy();
 });
 it('ignores an older list success or error after a newer list has completed',()=>{
  const f=fixture(),old=new Subject<any>(),latest=new Subject<any>();f.list.mockReturnValueOnce(old as any).mockReturnValueOnce(latest as any);f.c.load();f.c.load();
  latest.next([f.b]);latest.complete();old.next([f.a]);old.error(new Error('Old outage'));
  expect(f.rows().map((r:any)=>r.id)).toEqual([f.b.id]);expect(f.c.loadError).toBe('');f.c.ngOnDestroy();
 });
 it('does not reintroduce a completed request through an already pending list',()=>{
  const f=fixture(),read=new Subject<any>();f.c.startReject(f.a);f.c.rejectReason='A';f.confirm();f.list.mockReturnValue(read as any);f.c.load();
  f.pending.next({});f.pending.complete();read.next([f.a,f.b]);read.complete();expect(f.rows().map((r:any)=>r.id)).toEqual([f.b.id]);f.c.ngOnDestroy();
 });
 it('clears only the submitted editor after success and blocks repeating the completed decision',()=>{
  const f=fixture();f.c.startReject(f.a);f.c.rejectReason='A';f.confirm();f.pending.next({});f.pending.complete();
  expect(f.c.rejectId).toBe('');f.c.approve(f.a);expect(f.approve).not.toHaveBeenCalled();f.c.ngOnDestroy();
 });
 it('does not render or toast from a pending action after destruction',()=>{
  const f=fixture();f.c.startReject(f.a);f.c.rejectReason='A';f.confirm();f.detector.detectChanges.mockClear();f.c.ngOnDestroy();f.pending.next({});f.pending.error(new Error('Late'));
  expect(f.detector.detectChanges).not.toHaveBeenCalled();expect(f.notices.error).not.toHaveBeenCalled();
 });
 it('allows a corrected resubmission returned by a fresh read after the decision',()=>{
  const f=fixture();f.c.startReject(f.a);f.c.rejectReason='Needs correction';f.confirm();f.pending.next({});f.pending.complete();
  f.list.mockReturnValue(of([{...f.a,reason:'Corrected synthetic resubmission'}]));f.c.load();
  expect(f.rows().map((r:any)=>r.id)).toEqual([f.a.id]);f.c.startReject(f.a);expect(f.c.rejectId).toBe(f.a.id);f.c.ngOnDestroy();
 });
});

describe('Unified approvals captured decision',()=>{
 function fixture(){
  const a=row('TEST-A'),b=row('TEST-B'),pending=new Subject<any>(),api={listPendingLeaves:vi.fn(()=>of([a,b])),listPendingNominations:vi.fn(()=>of([])),approveLeave:vi.fn(()=>pending),rejectLeave:vi.fn(()=>pending)};
  const c=new ClientUnifiedApprovalsComponent(api as any,toast() as any,cdr() as any);c.load();c.select(c.queue.find(r=>r.id===a.id)!);return {c,a,b,pending,api};
 }
 for(const action of ['approve','reject']) it(`${action} records the original request and submitted notes while preserving a newer selection`,()=>{
  const f=fixture();f.c.decisionNotes='Notes A';f.c.rejectionReason='Reason A';
  if(action==='approve') f.c.approveSelected(); else f.c.rejectSelected();
  f.c.select(f.c.queue.find(r=>r.id===f.b.id)!);f.c.decisionNotes='Unsaved B';f.c.rejectionReason='Reason B';f.pending.next({});f.pending.complete();
  const audit=(f.c as any).auditTrail[0];expect(audit.id).toBe(f.a.id);expect(audit.note).toBe('Notes A');expect(audit.reason).toBe(action==='reject'?'Reason A':undefined);
  expect(f.c.selected?.id).toBe(f.b.id);expect(f.c.decisionNotes).toBe('Unsaved B');expect(f.c.rejectionReason).toBe('Reason B');expect(f.c.queue.some(r=>r.id===f.a.id)).toBe(false);f.c.ngOnDestroy();
 });
 it('does not replace a newer branch response or inject an older branch error',()=>{
  const f=fixture(),old=new Subject<any>(),latest=new Subject<any>();f.api.listPendingLeaves.mockReturnValueOnce(old as any).mockReturnValueOnce(latest as any);
  f.c.branchFilter='BRANCH-A';f.c.load();f.c.branchFilter='BRANCH-B';f.c.load();latest.next([{...f.b,branchId:'BRANCH-B'}]);latest.complete();old.error(new Error('Old outage'));
  expect(f.c.queue.map(r=>r.id)).toEqual([f.b.id]);expect(f.c.loadErrors).toEqual([]);f.c.ngOnDestroy();
 });
 it('removes a completed request even when a list read was already pending',()=>{
  const f=fixture(),read=new Subject<any>();f.c.approveSelected();f.api.listPendingLeaves.mockReturnValue(read as any);f.c.load();f.pending.next({});f.pending.complete();read.next([f.a,f.b]);read.complete();
  expect(f.c.queue.map(r=>r.id)).toEqual([f.b.id]);f.c.ngOnDestroy();
 });
 it('preserves rejection input and produces no decision history on failure',()=>{
  const f=fixture();f.c.rejectionReason='Retry reason';f.c.rejectSelected();f.pending.error(new Error('Synthetic failure'));
  expect(f.c.rejectionReason).toBe('Retry reason');expect((f.c as any).auditTrail).toEqual([]);expect(f.c.actionBusy).toBe(false);f.c.ngOnDestroy();
 });
 it('opens the required reason field before requesting a rejection',()=>{
  const f=fixture();f.c.rejectSelected();expect(f.c.decisionType).toBe('REJECT');expect(f.api.rejectLeave).not.toHaveBeenCalled();
  f.c.rejectionReason='Synthetic reason';f.c.rejectSelected();expect(f.api.rejectLeave).toHaveBeenCalledWith(f.a.id,'Synthetic reason');f.c.ngOnDestroy();
 });
 it('allows a resubmission from a fresh read after completion',()=>{
  const f=fixture();f.c.rejectionReason='Needs correction';f.c.rejectSelected();f.pending.next({});f.pending.complete();
  f.api.listPendingLeaves.mockReturnValue(of([{...f.a,reason:'Corrected synthetic reason'}]));f.c.load();
  expect(f.c.queue.map(r=>r.id)).toEqual([f.a.id]);f.c.select(f.c.queue[0]);f.c.approveSelected();expect(f.api.approveLeave).toHaveBeenCalledWith(f.a.id);f.c.ngOnDestroy();
 });
 it('reloads all assigned branches when clearing a server-filtered branch queue',()=>{
  const f=fixture();f.c.branchFilter='TEST-BRANCH';f.c.load();f.api.listPendingLeaves.mockClear();f.api.listPendingNominations.mockClear();
  f.c.clearFilters();expect(f.c.branchFilter).toBe('');expect(f.api.listPendingLeaves).toHaveBeenCalledWith(undefined);expect(f.api.listPendingNominations).toHaveBeenCalledWith(undefined);f.c.ngOnDestroy();
 });
});
