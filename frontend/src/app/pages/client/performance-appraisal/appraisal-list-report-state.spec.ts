import '@angular/compiler';
import { Subject, of } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { ClientAppraisalsListComponent } from './client-appraisals-list.component';
import { BranchAppraisalsListComponent } from '../../branch/performance-appraisal/branch-appraisals-list.component';
import { ClientAppraisalReportsComponent } from './client-appraisal-reports.component';

const detector=()=>({markForCheck:vi.fn()});
const rows=(id:string)=>({data:[{id,employee_name:'Synthetic '+id,status:'BRANCH_REVIEWED'}],total:1});
describe.each(['Client','Branch'])('%s appraisal list responses',kind=>{
 function fixture(){const reads:Subject<any>[]=[],svc={getAppraisals:vi.fn(()=>{const s=new Subject<any>();reads.push(s);return s;}),getCycles:vi.fn(()=>of([]))},cdr=detector();const c:any=kind==='Client'?new ClientAppraisalsListComponent(svc as any,cdr as any):new BranchAppraisalsListComponent(svc as any,cdr as any);return{c,svc,reads,cdr};}
 it('keeps the newest filter result when the older response finishes last',()=>{
  const f=fixture();f.c.search='OLD';f.c.load();f.c.search='NEW';f.c.load();f.reads[1].next(rows('NEW'));f.reads[1].complete();f.reads[0].next(rows('OLD'));f.reads[0].complete();expect(f.c.appraisals[0].id).toBe('NEW');f.c.ngOnDestroy();
 });
 it('does not stop the latest loading state when an older read completes',()=>{
  const f=fixture();f.c.load();f.c.load();f.reads[0].next(rows('OLD'));f.reads[0].complete();expect(f.c.loading).toBe(true);expect(f.c.appraisals).toEqual([]);f.c.ngOnDestroy();
 });
 it('restarts at page one when filters change, but retains pagination for normal loads',()=>{
  const f=fixture();f.c.page=4;f.c.filtersChanged();expect(f.svc.getAppraisals).toHaveBeenLastCalledWith(expect.objectContaining({page:1}));f.c.page=2;f.c.load();expect(f.svc.getAppraisals).toHaveBeenLastCalledWith(expect.objectContaining({page:2}));f.c.ngOnDestroy();
 });
 it('clears old rows while a different filter is loading',()=>{
  const f=fixture();f.c.load();f.reads[0].next(rows('OLD'));f.reads[0].complete();f.c.status='LOCKED';f.c.load();expect(f.c.appraisals).toEqual([]);f.c.ngOnDestroy();
 });
 it('shows a failed read as unavailable and supports retry without stale rows',()=>{
  const f=fixture();f.c.load();f.reads[0].next(rows('OLD'));f.reads[0].complete();f.c.load();f.reads[1].error(new Error('Synthetic outage'));
  expect(f.c.loading).toBe(false);expect(f.c.loadError).toBeTruthy();expect(f.c.appraisals).toEqual([]);
  f.c.load();f.reads[2].next({data:[],total:0});f.reads[2].complete();expect(f.c.loadError).toBe('');expect(f.c.total).toBe(0);f.c.ngOnDestroy();
 });
 it('ignores an old read failure after the new result has completed',()=>{
  const f=fixture();f.c.load();f.c.load();f.reads[1].next(rows('NEW'));f.reads[1].complete();f.reads[0].error(new Error('Old outage'));
  expect(f.c.loadError).toBe('');expect(f.c.appraisals[0].id).toBe('NEW');f.c.ngOnDestroy();
 });
 it('recovers cycle options independently without clearing the list',()=>{
  const f=fixture(),read=new Subject<any>();f.c.appraisals=rows('KEPT').data;f.svc.getCycles.mockReturnValueOnce(read as any);f.c.loadCycles();read.error(new Error('Synthetic cycles outage'));
  expect(f.c.cyclesError).toBeTruthy();expect(f.c.appraisals[0].id).toBe('KEPT');f.c.loadCycles();expect(f.c.cyclesError).toBe('');f.c.ngOnDestroy();
 });
 it('does not render after destruction with reads pending',()=>{
  const f=fixture();f.c.load();f.c.ngOnDestroy();f.cdr.markForCheck.mockClear();f.reads[0].next(rows('LATE'));f.reads[0].complete();expect(f.cdr.markForCheck).not.toHaveBeenCalled();
 });
});
describe('Client appraisal report snapshots',()=>{
 function fixture(){const reads:{branch:Subject<any>,dept:Subject<any>,rec:Subject<any>}[]=[];let index=-1;const svc={getCycles:()=>of([]),getBranchSummary:vi.fn(()=>{index++;reads.push({branch:new Subject(),dept:new Subject(),rec:new Subject()});return reads[index].branch;}),getDepartmentSummary:vi.fn(()=>reads[index].dept),getRecommendations:vi.fn(()=>reads[index].rec)};const c=new ClientAppraisalReportsComponent(svc as any,detector() as any);return{c,svc,reads};}
 const finish=(r:{branch:Subject<any>,dept:Subject<any>,rec:Subject<any>},name:string)=>{r.branch.next([{branch_name:name}]);r.branch.complete();r.dept.next([{department:name}]);r.dept.complete();r.rec.next([{recommendation:name}]);r.rec.complete();};
 it('keeps all three summaries on the latest cycle',()=>{
  const f=fixture();f.c.cycleId='OLD';f.c.loadAll();f.c.cycleId='NEW';f.c.loadAll();finish(f.reads[1],'NEW');finish(f.reads[0],'OLD');expect(f.c.branchData[0].branch_name).toBe('NEW');expect(f.c.deptData[0].department).toBe('NEW');expect(f.c.recData[0].recommendation).toBe('NEW');f.c.ngOnDestroy();
 });
 it('does not publish partial summaries before all three reads complete',()=>{
  const f=fixture();f.c.loadAll();f.reads[0].branch.next([{branch_name:'PARTIAL'}]);f.reads[0].branch.complete();expect(f.c.branchData).toEqual([]);expect(f.c.loading).toBe(true);f.c.ngOnDestroy();
 });
 it('settles a failed report request, clears old summaries and retries',()=>{
  const f=fixture();f.c.loadAll();finish(f.reads[0],'OLD');f.c.loadAll();f.reads[1].dept.error(new Error('Synthetic department outage'));
  expect(f.c.loading).toBe(false);expect(f.c.loadError).toBeTruthy();expect(f.c.branchData).toEqual([]);
  f.c.loadAll();finish(f.reads[2],'NEW');expect(f.c.loadError).toBe('');expect(f.c.recData[0].recommendation).toBe('NEW');f.c.ngOnDestroy();
 });
 it('ignores an old report failure while the new cycle remains loading',()=>{
  const f=fixture();f.c.loadAll();f.c.cycleId='NEW';f.c.loadAll();f.reads[0].dept.error(new Error('Old outage'));expect(f.c.loading).toBe(true);expect(f.c.loadError).toBe('');finish(f.reads[1],'NEW');expect(f.c.branchData[0].branch_name).toBe('NEW');f.c.ngOnDestroy();
 });
});
it('labels only an unlocked branch-reviewed appraisal as approvable',()=>{
 const c=new ClientAppraisalsListComponent({} as any,detector() as any);expect(c.canApprove({status:'MANAGER_REVIEWED'} as any)).toBe(false);expect(c.canApprove({status:'BRANCH_REVIEWED',lockedAt:'2026-01-01'} as any)).toBe(false);expect(c.canApprove({status:'BRANCH_REVIEWED'} as any)).toBe(true);c.ngOnDestroy();
});

describe('Appraisal report exports',()=>{
 function fixture(){const pending=new Subject<any>(),svc={getBranchSummary:()=>of([]),getDepartmentSummary:()=>of([]),getRecommendations:()=>of([]),exportAppraisals:vi.fn(()=>pending)};const c=new ClientAppraisalReportsComponent(svc as any,detector() as any);c.loadAll();const download=vi.spyOn(c as any,'downloadRows').mockImplementation(()=>{});return{c,svc,pending,download};}
 it('blocks export during loading, report failure and duplicate export',()=>{
  const f=fixture();f.c.loading=true;f.c.exportData();f.c.loading=false;f.c.loadError='Synthetic failure';f.c.exportData();expect(f.svc.exportAppraisals).not.toHaveBeenCalled();
  f.c.loadError='';f.c.exportData();f.c.exportData();expect(f.svc.exportAppraisals).toHaveBeenCalledTimes(1);f.c.ngOnDestroy();
 });
 it('does not download results for an earlier cycle after a filter change',()=>{
  const f=fixture();f.c.cycleId='OLD';f.c.exportData();f.c.cycleId='NEW';f.c.loadAll();f.pending.next([{employee:'OLD'}]);f.pending.complete();expect(f.download).not.toHaveBeenCalled();expect(f.c.exportError).toBe('');f.c.ngOnDestroy();
 });
 it('does not clear a newer export busy state when the older export finishes',()=>{
  const f=fixture(),latest=new Subject<any>();f.c.exportData();f.c.cycleId='NEW';f.c.loadAll();f.svc.exportAppraisals.mockReturnValue(latest);f.c.exportData();f.pending.complete();expect(f.c.exporting).toBe(true);latest.next([{employee:'NEW'}]);latest.complete();expect(f.download).toHaveBeenCalledWith([{employee:'NEW'}]);expect(f.c.exporting).toBe(false);f.c.ngOnDestroy();
 });
 it('shows an export failure and permits retry with the same cycle',()=>{
  const f=fixture(),retry=new Subject<any>();f.c.cycleId='TEST';f.c.exportData();f.pending.error(new Error('Synthetic outage'));expect(f.c.exportError).toBeTruthy();expect(f.c.exporting).toBe(false);
  f.svc.exportAppraisals.mockReturnValue(retry);f.c.exportData();retry.next([{employee:'Synthetic'}]);retry.complete();expect(f.c.exportError).toBe('');expect(f.download).toHaveBeenCalledOnce();expect(f.svc.exportAppraisals).toHaveBeenLastCalledWith('TEST');f.c.ngOnDestroy();
 });
 it('does not download an empty file when there are no export rows',()=>{
  const f=fixture();f.c.exportData();f.pending.next([]);f.pending.complete();expect(f.download).not.toHaveBeenCalled();expect(f.c.exportError).toContain('No appraisals');f.c.ngOnDestroy();
 });
 it('does not download or render after destruction',()=>{
  const f=fixture();f.c.exportData();f.c.ngOnDestroy();f.pending.next([{employee:'Late'}]);f.pending.complete();expect(f.download).not.toHaveBeenCalled();
 });
});
