import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import { ComplianceAssistantComponent } from '../shared/components/compliance-assistant/compliance-assistant.component';
import { BranchDocumentsComponent } from './branch/branch-documents/branch-documents.component';
import { ClientComplianceStatusComponent } from './client/compliance/client-compliance-status.component';

describe('Client / Branch Desk follow-up workflows',()=>{
 it('requests the selected scope, clears stale AI plans and cancels in-flight work when filters change',()=>{
   const response=new Subject<any>();const post=vi.fn(()=>response);
   const c=new ComplianceAssistantComponent({post} as any);c.month=8;c.year=2026;c.branchId='b2';c.generate();
   expect(post.mock.calls[0]).toEqual([expect.stringContaining('/legitx/assistant/plan'),{month:8,year:2026,branchId:'b2'}]);
   expect(c.loading()).toBe(true);c.ngOnChanges();response.next({mode:'AI',actions:[]});
   expect(c.result()).toBe(null);expect(c.loading()).toBe(false);c.ngOnDestroy();
 });
 it('shows a recoverable error and a truthful rules-based fallback on retry',()=>{
   const plan={mode:'RULES',actions:[],note:'AI unavailable'};
   const post=vi.fn().mockReturnValueOnce(throwError(()=>new Error('offline'))).mockReturnValueOnce(of(plan));
   const c=new ComplianceAssistantComponent({post} as any);c.generate();expect(c.error()).toContain('could not be loaded');
   c.generate();expect(c.error()).toBe('');expect(c.result()?.mode).toBe('RULES');c.ngOnDestroy();
 });
 it('loads the next task page and resets paging when filters change',()=>{
   const getComplianceStatusTasks=vi.fn(()=>of([]));
   const c=new ClientComplianceStatusComponent({getComplianceStatusTasks} as any,{} as any,{markForCheck:vi.fn()} as any,{} as any,{} as any,{} as any);
   c.activeTab='tasks';c.loadTabData(100);expect(getComplianceStatusTasks).toHaveBeenCalledWith(expect.any(Number),expect.any(Number),expect.objectContaining({offset:100}));
   c.onTaskStatusChange();expect(c.taskOffset).toBe(0);c.ngOnDestroy();
 });
 it('preserves document records when one branch fails and recovers on retry',()=>{
   const listDocuments=vi.fn().mockReturnValueOnce(of([])).mockReturnValueOnce(throwError(()=>new Error('offline'))).mockReturnValue(of([]));
   const c=new BranchDocumentsComponent({markForCheck:vi.fn()} as any,{listDocuments} as any,{} as any);
   c.branches=[{id:'b1',name:'One'},{id:'b2',name:'Two'}];
   c.documents=[{id:'existing'} as any];c.loadAllDocs();expect(c.loadError).toContain('could not be refreshed');expect(c.documents[0].id).toBe('existing');
   c.loadAllDocs();expect(c.loadError).toBe('');expect(c.documents).toEqual([]);c.ngOnDestroy();
 });
 it('follows linked month, branch and status and keeps all assigned branches when unfiltered',()=>{
   const queryParamMap=new BehaviorSubject(convertToParamMap({month:'8',year:'2026',branchId:'b2',status:'OVERDUE'}));
   const route={snapshot:{data:{portal:'branch'}},queryParamMap};
   const c=new ClientComplianceStatusComponent({getBranches:()=>of([{id:'b1',branchName:'One'},{id:'b2',branchName:'Two'}])} as any,{} as any,{markForCheck:vi.fn()} as any,{} as any,route as any,{getUser:()=>({})} as any);
   const load=vi.spyOn(c,'loadAll').mockImplementation(()=>{});
   c.ngOnInit();expect(c.month).toBe(8);expect(c.year).toBe(2026);expect(c.selectedBranchId).toBe('b2');expect(c.taskStatus).toBe('OVERDUE');expect(c.activeTab).toBe('tasks');
   queryParamMap.next(convertToParamMap({month:'9',year:'2026'}));expect(c.selectedBranchId).toBe('');expect(c.currentBranchLabel).toBe('All assigned branches');expect(load).toHaveBeenCalledTimes(2);c.ngOnDestroy();
 });
});
