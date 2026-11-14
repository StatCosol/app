import '@angular/compiler';
import { Subject } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { PayrollFnfComponent } from './payroll-fnf.component';

const row=(id:string,amount=100)=>({id,clientId:'TEST-CLIENT',status:'INITIATED',settlementAmount:amount,settlementBreakup:{pendingSalary:amount},remarks:'Saved '+id} as any);
function setup(confirm = () => Promise.resolve(true)) {
 const details:{id:string,response:Subject<any>}[]=[],docs:{id:string,response:Subject<any>}[]=[],lists:Subject<any>[]=[];
 const action=new Subject<any>(),upload=new Subject<any>(),removed=new Subject<any>();
 const api={
  getFullAndFinalCaseById:vi.fn((id:string)=>{const response=new Subject<any>();details.push({id,response});return response;}),
  listFnfDocuments:vi.fn((id:string)=>{const response=new Subject<any>();docs.push({id,response});return response;}),
  getFullAndFinalCases:vi.fn(()=>{const response=new Subject<any>();lists.push(response);return response;}),
  saveFnfBreakup:vi.fn((..._args:any[])=>action),approveFullAndFinal:vi.fn((..._args:any[])=>action),settleFullAndFinal:vi.fn((..._args:any[])=>action),updateFnfStatus:vi.fn((..._args:any[])=>action),
  uploadFnfDocument:vi.fn(()=>upload),deleteFnfDocument:vi.fn(()=>removed),
  createFnf:vi.fn((..._args:any[])=>action),getEmployees:vi.fn((..._args:any[])=>new Subject<any>()),
 };
 const toast={success:vi.fn(),error:vi.fn()};
 const c=new PayrollFnfComponent(api as any,toast as any,{confirm} as any,{markForCheck(){}} as any,{} as any);
 const select=(id:string,amount=100)=>{c.selectCase(row(id,amount));details.at(-1)!.response.next(row(id,amount));details.at(-1)!.response.complete();};
 return {c,api,toast,details,docs,lists,action,upload,removed,select};
}
describe('Full and final case scope',()=>{
 it('keeps latest selected case when earlier detail finishes late',()=>{
  const t=setup();t.c.selectCase(row('TEST-A'));t.c.selectCase(row('TEST-B',200));
  t.details[1].response.next(row('TEST-B',200));t.details[1].response.complete();
  t.details[0].response.next(row('TEST-A'));t.details[0].response.complete();
  expect(t.c.selectedCase?.id).toBe('TEST-B');expect(t.c.settlementInputs.pendingSalary).toBe(200);t.c.ngOnDestroy();
 });
 it('keeps latest case documents when earlier document list finishes late',()=>{
  const t=setup();t.select('TEST-A');t.select('TEST-B',200);
  t.docs[1].response.next([{id:'TEST-B-DOC'}]);t.docs[1].response.complete();
  t.docs[0].response.next([{id:'TEST-A-DOC'}]);t.docs[0].response.complete();
  expect(t.c.selectedCase?.id).toBe('TEST-B');expect(t.c.fnfDocuments).toEqual([{id:'TEST-B-DOC'}]);t.c.ngOnDestroy();
 });
 it('preserves B draft while refreshing the queue after A breakup save',()=>{
  const t=setup();t.select('TEST-A');t.c.saveBreakup();t.select('TEST-B',200);
  t.c.settlementInputs.pendingSalary=999;t.c.statusRemarks='UNSAVED B';t.c.settlementAmountInput=999;
  expect(t.api.saveFnfBreakup.mock.calls[0][0]).toBe('TEST-A');const before=t.details.length;
  t.action.next({settlementAmount:123});t.action.complete();t.lists.at(-1)!.next({data:[row('TEST-A',123),row('TEST-B',200)],total:2});t.lists.at(-1)!.complete();
  expect(t.c.selectedCase?.id).toBe('TEST-B');expect(t.details).toHaveLength(before);
  expect(t.c.settlementInputs.pendingSalary).toBe(999);expect(t.c.settlementAmountInput).toBe(999);expect(t.c.statusRemarks).toBe('UNSAVED B');t.c.ngOnDestroy();
 });
});

describe('Full and final delayed reads and saved draft reconciliation',()=>{
 it('ignores stale detail errors and leaves the newer load pending',()=>{
  const t=setup();t.c.selectCase(row('TEST-A'));t.c.selectCase(row('TEST-B'));
  t.details[0].response.error(new Error('Synthetic stale error'));expect(t.c.detailLoading).toBe(true);expect(t.toast.error).not.toHaveBeenCalled();
  t.details[1].response.next(row('TEST-B'));t.details[1].response.complete();expect(t.c.detailLoading).toBe(false);t.c.ngOnDestroy();
 });
 it('clears old documents while selecting and ignores stale document failures',()=>{
  const t=setup();t.select('TEST-A');t.docs[0].response.next([{id:'A-doc'}]);t.c.selectCase(row('TEST-B'));
  expect(t.c.fnfDocuments).toEqual([]);expect(t.c.selectedCase).toBeNull();t.details[1].response.next(row('TEST-B'));t.details[1].response.complete();
  t.docs[0].response.error(new Error('Synthetic stale failure'));expect(t.c.fnfDocsLoading).toBe(true);
  t.docs[1].response.next([{id:'B-doc'}]);t.docs[1].response.complete();expect(t.c.fnfDocuments).toEqual([{id:'B-doc'}]);t.c.ngOnDestroy();
 });
 it('does not reopen a closed detail from a pending response',()=>{
  const t=setup();t.c.selectCase(row('TEST-A'));t.c.closeDetail();t.details[0].response.next(row('TEST-A'));t.details[0].response.complete();
  expect(t.c.selectedCase).toBeNull();expect(t.docs).toEqual([]);expect(t.c.detailLoading).toBe(false);t.c.ngOnDestroy();
 });
 it('ignores an older client list and its finalizer after a scope change',()=>{
  const t=setup();t.c.selectedClientId='A';t.c.onFilterChange();t.c.selectedClientId='B';t.c.onFilterChange();
  t.lists[0].next({data:[row('TEST-A')],total:1});t.lists[0].complete();expect(t.c.loading).toBe(true);expect(t.c.cases).toEqual([]);
  t.lists[1].next({data:[row('TEST-B')],total:1});t.lists[1].complete();expect(t.c.cases.map(r=>r.id)).toEqual(['TEST-B']);expect(t.details.at(-1)!.id).toBe('TEST-B');t.c.ngOnDestroy();
 });
 it('preserves pre-existing unsaved amounts when a status action refreshes the same case',()=>{
  const t=setup();t.select('TEST-A');t.c.settlementInputs.pendingSalary=999;t.c.settlementAmountInput=999;t.c.statusRemarks='UNSAVED';
  t.c.moveToUnderReview();t.action.next({});t.action.complete();
  t.details.at(-1)!.response.next({...row('TEST-A',100),status:'UNDER_REVIEW'});t.details.at(-1)!.response.complete();
  expect(t.c.selectedCase?.status).toBe('UNDER_REVIEW');expect(t.c.settlementInputs.pendingSalary).toBe(999);expect(t.c.settlementAmountInput).toBe(999);expect(t.c.statusRemarks).toBe('UNSAVED');t.c.ngOnDestroy();
 });
 it('acknowledges saved breakup fields but preserves later field edits and unsent settlement amount',()=>{
  const t=setup();t.select('TEST-A');t.c.settlementInputs.pendingSalary=123;t.c.settlementInputs.bonusArrears=10;t.c.settlementAmountInput=987;t.c.saveBreakup();
  t.c.settlementInputs.pendingSalary=456;t.action.next({settlementAmount:133});t.action.complete();
  t.details.at(-1)!.response.next({...row('TEST-A',133),settlementBreakup:{pendingSalary:123,bonusArrears:11}});t.details.at(-1)!.response.complete();
  expect(t.c.settlementInputs.pendingSalary).toBe(456);expect(t.c.settlementInputs.bonusArrears).toBe(11);expect(t.c.settlementAmountInput).toBe(987);t.c.ngOnDestroy();
 });
 it('retains drafts when breakup save fails and does not reconcile unsaved data',()=>{
  const t=setup();t.select('TEST-A');t.c.settlementInputs.pendingSalary=999;t.c.saveBreakup();t.action.error(new Error('Synthetic failure'));
  expect(t.c.settlementInputs.pendingSalary).toBe(999);expect(t.c.breakupSaveBusy).toBe(false);expect(t.lists).toEqual([]);t.c.ngOnDestroy();
 });
 it('does not reconcile a saved case into a different filter scope',()=>{
  const t=setup();t.select('TEST-A');t.c.saveBreakup();t.c.selectedClientId='OTHER';t.c.onFilterChange();const before=t.lists.length;
  t.action.next({settlementAmount:100});t.action.complete();expect(t.lists).toHaveLength(before);expect(t.c.selectedCase).toBeNull();t.c.ngOnDestroy();
 });
 it('accepts only the newest mutation reconciliation response',()=>{
  const t=setup();const save=new Subject<any>(),approve=new Subject<any>();t.api.saveFnfBreakup.mockReturnValue(save);t.api.approveFullAndFinal.mockReturnValue(approve);
  t.select('TEST-A');t.c.saveBreakup();save.next({});save.complete();const old=t.details.at(-1)!;
  t.c.approveCase();approve.next({});approve.complete();const fresh=t.details.at(-1)!;
  fresh.response.next({...row('TEST-A',200),status:'APPROVED'});fresh.response.complete();old.response.next(row('TEST-A',100));old.response.complete();
  expect(t.c.selectedCase?.status).toBe('APPROVED');expect(t.c.selectedCase?.settlementAmount).toBe(200);t.c.ngOnDestroy();
 });
 it.each(['approveCase','settleCase','moveToUnderReview'] as const)('%s keeps B selected when A completes',method=>{
  const t=setup();t.select('TEST-A');if(method==='settleCase')t.c.selectedCase!.status='APPROVED';t.c[method]();t.select('TEST-B');t.c.statusRemarks='UNSAVED B';const before=t.details.length;
  t.action.next({});t.action.complete();t.lists.at(-1)!.next({data:[row('TEST-A'),row('TEST-B')],total:2});t.lists.at(-1)!.complete();
  expect(t.c.selectedCase?.id).toBe('TEST-B');expect(t.c.statusRemarks).toBe('UNSAVED B');expect(t.details).toHaveLength(before);t.c.ngOnDestroy();
 });
});

describe('Full and final document callbacks',()=>{
 const event=()=>({target:{files:[{name:'TEST-evidence.pdf'}],value:'fixture'}} as unknown as Event);
 it.each(['switch','close','destroy'] as const)('does not start deletion after a delayed confirmation and %s',async change=>{
  let resolve!: (value:boolean)=>void;
  const confirmation=new Promise<boolean>(done=>resolve=done),t=setup(()=>confirmation);
  t.select('TEST-A');const pending=t.c.deleteFnfDoc({id:'A-doc'});
  if(change==='switch')t.select('TEST-B');else if(change==='close')t.c.closeDetail();else t.c.ngOnDestroy();
  resolve(true);await pending;expect(t.api.deleteFnfDocument).not.toHaveBeenCalled();
  if(change!=='destroy')t.c.ngOnDestroy();
 });
 it('keeps a newer case document form after the original upload completes',()=>{
  const t=setup();t.select('TEST-A');t.c.fnfDocName='A doc';t.c.onFnfDocFileSelected(event());t.select('TEST-B');t.c.fnfDocName='UNSAVED B';t.c.fnfDocRemarks='B remarks';const before=t.docs.length;
  t.upload.next({});t.upload.complete();expect(t.c.fnfDocName).toBe('UNSAVED B');expect(t.c.fnfDocRemarks).toBe('B remarks');expect(t.docs).toHaveLength(before);t.c.ngOnDestroy();
 });
 it('preserves later upload fields in the same case and blocks duplicate uploads',()=>{
  const t=setup();t.select('TEST-A');t.c.fnfDocName='A doc';t.c.onFnfDocFileSelected(event());t.c.onFnfDocFileSelected(event());t.c.fnfDocName='NEXT doc';
  t.upload.next({});t.upload.complete();expect(t.api.uploadFnfDocument).toHaveBeenCalledTimes(1);expect(t.c.fnfDocName).toBe('NEXT doc');expect(t.docs.at(-1)!.id).toBe('TEST-A');t.c.ngOnDestroy();
 });
 it('does not reopen or load a newer case after deletion completes',async()=>{
  const t=setup();t.select('TEST-A');await t.c.deleteFnfDoc({id:'A-doc'});t.select('TEST-B');const before=t.docs.length;
  t.removed.next({});t.removed.complete();expect(t.c.selectedCase?.id).toBe('TEST-B');expect(t.docs).toHaveLength(before);t.c.ngOnDestroy();
 });
 it.each(['upload','delete'] as const)('refreshes reselected A documents after %s but preserves the newer document form',async method=>{
  const t=setup();t.select('TEST-A');if(method==='upload'){t.c.fnfDocName='Submitted name';t.c.onFnfDocFileSelected(event());}else await t.c.deleteFnfDoc({id:'A-doc'});
  t.select('TEST-B');t.select('TEST-A');t.c.fnfDocName='UNSAVED new A name';t.c.fnfDocRemarks='UNSAVED A remarks';const stale=t.docs.at(-1)!;
  stale.response.next([{id:'Old-A-doc'}]);const completed=method==='upload'?t.upload:t.removed;completed.next({});completed.complete();
  const fresh=t.docs.at(-1)!;expect(fresh).not.toBe(stale);fresh.response.next([{id:'Current-A-doc'}]);fresh.response.complete();stale.response.next([{id:'Old-A-doc'}]);stale.response.complete();
  expect(t.c.fnfDocuments).toEqual([{id:'Current-A-doc'}]);expect(t.c.fnfDocName).toBe('UNSAVED new A name');expect(t.c.fnfDocRemarks).toBe('UNSAVED A remarks');t.c.ngOnDestroy();
 });
});

describe.each(['saveBreakup','approveCase','moveToUnderReview'] as const)('Full and final same-case reselection after %s',method=>{
 it('refreshes original case metadata after A to B to A while preserving the reopened draft',()=>{
  const t=setup();t.select('TEST-A');t.c[method]();t.select('TEST-B');t.select('TEST-A');t.c.settlementInputs.pendingSalary=777;t.c.statusRemarks='UNSAVED reopened A';
  t.action.next({});t.action.complete();const fresh=t.details.at(-1)!;fresh.response.next({...row('TEST-A',123),status:'APPROVED'});fresh.response.complete();
  expect(t.c.selectedCase?.status).toBe('APPROVED');expect(t.c.settlementInputs.pendingSalary).toBe(777);expect(t.c.statusRemarks).toBe('UNSAVED reopened A');t.c.ngOnDestroy();
 });
 it('supersedes a pending reselected A detail that started before the action completed',()=>{
  const t=setup();t.select('TEST-A');t.c[method]();t.select('TEST-B');t.c.selectCase(row('TEST-A'));const stale=t.details.at(-1)!;
  t.action.next({});t.action.complete();const fresh=t.details.at(-1)!;expect(fresh).not.toBe(stale);
  fresh.response.next({...row('TEST-A',123),status:'APPROVED'});fresh.response.complete();stale.response.next(row('TEST-A'));stale.response.complete();
  expect(t.c.selectedCase?.status).toBe('APPROVED');expect(t.c.settlementInputs.pendingSalary).toBe(123);expect(t.c.detailLoading).toBe(false);expect(t.docs.at(-1)!.id).toBe('TEST-A');t.c.ngOnDestroy();
 });
});

describe('Full and final create modal and pending writes',()=>{
 it('blocks settlement until the saved breakup total is reconciled even when the queue finishes first',()=>{
  const t=setup();t.select('TEST-A');t.c.selectedCase!.status='APPROVED';t.c.settlementInputs.pendingSalary=200;t.c.saveBreakup();
  t.action.next({settlementAmount:200});t.action.complete();t.lists.at(-1)!.next({data:[{...row('TEST-A',200),status:'APPROVED'}],total:1});t.lists.at(-1)!.complete();
  expect(t.c.breakupSaveBusy).toBe(false);expect(t.c.canSettle).toBe(false);t.c.settleCase();expect(t.api.settleFullAndFinal).not.toHaveBeenCalled();
  t.details.at(-1)!.response.next({...row('TEST-A',200),status:'APPROVED'});t.details.at(-1)!.response.complete();
  expect(t.c.canSettle).toBe(true);expect(t.c.settlementAmountInput).toBe(200);t.c.settleCase();
  expect(t.api.settleFullAndFinal.mock.calls[0][1]).toBe(200);expect(t.api.settleFullAndFinal.mock.calls[0][2].pendingSalary).toBe(200);t.c.ngOnDestroy();
 });
 it('keeps settlement blocked after reconciliation fails until a fresh case read succeeds',()=>{
  const t=setup();t.select('TEST-A');t.c.selectedCase!.status='APPROVED';t.c.settlementInputs.pendingSalary=200;t.c.saveBreakup();
  t.action.next({settlementAmount:200});t.action.complete();t.details.at(-1)!.response.error(new Error('Synthetic refresh failure'));
  expect(t.c.canSettle).toBe(false);t.c.settleCase();expect(t.api.settleFullAndFinal).not.toHaveBeenCalled();
  t.c.selectCase(row('TEST-A'));t.details.at(-1)!.response.next({...row('TEST-A',200),status:'APPROVED'});t.details.at(-1)!.response.complete();
  expect(t.c.canSettle).toBe(true);expect(t.c.settlementAmountInput).toBe(200);t.c.ngOnDestroy();
 });
 it('does not let a pre-save case read clear the settlement refresh requirement after changing scope',()=>{
  const t=setup();t.select('TEST-A');t.c.selectedCase!.status='APPROVED';t.c.settlementInputs.pendingSalary=200;t.c.saveBreakup();
  t.c.lifecycleFilter='APPROVED';t.c.onFilterChange();t.c.selectCase(row('TEST-A'));const old=t.details.at(-1)!;
  t.action.next({settlementAmount:200});t.action.complete();old.response.next({...row('TEST-A',100),status:'APPROVED'});old.response.complete();
  expect(t.c.canSettle).toBe(false);t.c.settleCase();expect(t.api.settleFullAndFinal).not.toHaveBeenCalled();t.c.ngOnDestroy();
 });
 it('preserves a newer modal when an earlier create finishes',()=>{
  const t=setup();t.c.openCreateModal();Object.assign(t.c.createModel,{clientId:'TEST-CLIENT',employeeId:'TEST-A',separationDate:'2025-12-31'});t.c.createCase();
  t.c.closeCreateModal();t.c.openCreateModal();Object.assign(t.c.createModel,{clientId:'TEST-CLIENT',employeeId:'TEST-B',separationDate:'2025-12-31',remarks:'UNSAVED B'});
  t.action.next({id:'CREATED-A'});t.action.complete();expect(t.c.showCreateModal).toBe(true);expect(t.c.createModel.remarks).toBe('UNSAVED B');expect(t.c.canCreateCase).toBe(true);t.c.ngOnDestroy();
 });
 it('preserves later creation text without allowing duplicate creation of the saved employee',()=>{
  const t=setup();t.c.openCreateModal();Object.assign(t.c.createModel,{clientId:'TEST-CLIENT',employeeId:'TEST-A',separationDate:'2025-12-31'});t.c.createCase();t.c.createModel.remarks='Later unsaved reason';
  t.action.next({id:'CREATED-A'});t.action.complete();expect(t.c.showCreateModal).toBe(true);expect(t.c.createModel.remarks).toBe('Later unsaved reason');expect(t.c.canCreateCase).toBe(false);
  t.c.createCase();expect(t.api.createFnf).toHaveBeenCalledTimes(1);t.c.createModel.employeeId='TEST-B';expect(t.c.canCreateCase).toBe(true);t.c.ngOnDestroy();
 });
 it('ignores older client employee-picker responses',()=>{
  const t=setup(),a=new Subject<any>(),b=new Subject<any>();t.api.getEmployees.mockReturnValueOnce(a).mockReturnValueOnce(b);t.c.openCreateModal();t.c.createModel.clientId='A';t.c.onCreateClientChange();t.c.createModel.clientId='B';t.c.onCreateClientChange();
  a.next({data:[{id:'A-worker'}]});a.complete();expect(t.c.modalEmployees).toEqual([]);expect(t.c.modalEmployeesLoading).toBe(true);
  b.next({data:[{id:'B-worker'}]});b.complete();expect(t.c.modalEmployees.map(r=>r.id)).toEqual(['B-worker']);t.c.ngOnDestroy();
 });
 it('blocks lifecycle writes while breakup is pending, and breakup while lifecycle write is pending',()=>{
  const t=setup();t.select('TEST-A');t.c.saveBreakup();t.c.approveCase();t.c.moveToUnderReview();t.c.settleCase();
  expect(t.api.approveFullAndFinal).not.toHaveBeenCalled();expect(t.api.updateFnfStatus).not.toHaveBeenCalled();expect(t.api.settleFullAndFinal).not.toHaveBeenCalled();
  t.action.next({});t.action.complete();t.c.actionBusy=true;t.c.saveBreakup();expect(t.api.saveFnfBreakup).toHaveBeenCalledTimes(1);t.c.ngOnDestroy();
 });
});

