import '@angular/compiler';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { CcoPayrollApprovalsComponent } from './cco-payroll-approvals.component';
import { ContractorPayrollOversightComponent } from '../../shared/contractor-payroll/contractor-payroll-oversight.component';
import { PayrollEngineApiService } from '../payroll/payroll-engine-api.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';

const structure = (id: string) => ({id, name:`Synthetic ${id}`, clientName:'Test fixture', approvalStatus:'PENDING', scopeType:'CLIENT'} as any);
const run = (id: string) => ({id, clientName:'Test fixture', status:'SUBMITTED', periodYear:2025,periodMonth:12,employeeCount:1} as any);
afterEach(()=>TestBed.resetTestingModule());
async function setup() {
  const requests: {url:string,options:any,response:Subject<any>}[]=[];
  const items: {id:string,response:Subject<any>}[]=[];
  const action=new Subject<any>();
  const get=vi.fn((url:string,options:any)=>{const response=new Subject<any>();requests.push({url,options,response});return response;});
  const error=vi.fn();
  await TestBed.configureTestingModule({imports:[CcoPayrollApprovalsComponent],providers:[
    {provide:HttpClient,useValue:{get,post:vi.fn(()=>action)}},
    {provide:PayrollEngineApiService,useValue:{listStructureItems:(id:string)=>{const response=new Subject<any>();items.push({id,response});return response;},approveStructure:()=>action,rejectStructure:()=>action}},
    {provide:ToastService,useValue:{error,success:vi.fn()}},
    {provide:ConfirmDialogService,useValue:{confirm:()=>Promise.resolve(true),prompt:()=>Promise.resolve({confirmed:true,value:'Synthetic test reason'})}},
  ]}).overrideComponent(CcoPayrollApprovalsComponent,{remove:{imports:[ContractorPayrollOversightComponent]},add:{schemas:[NO_ERRORS_SCHEMA]}}).compileComponents();
  const fixture=TestBed.createComponent(CcoPayrollApprovalsComponent);
  const render=async()=>{fixture.changeDetectorRef.markForCheck();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();};
  await render();
  return {fixture,vm:fixture.componentInstance,requests,items,action,error,render};
}

describe.each([390,768,1440])('CCO review scope at %ipx',width=>{
  beforeEach(async()=>page.viewport(width,900));
  it('keeps the selected structure and its components together when older detail finishes late',async()=>{
    const t=await setup();t.vm.setMode('STRUCTURES');t.requests[1].response.next([structure('A'),structure('B')]);t.requests[1].response.complete();
    t.vm.selectRow(structure('A'));t.vm.selectRow(structure('B'));
    t.items[1].response.next([{id:'B-item',componentName:'Synthetic B component'}]);t.items[1].response.complete();
    t.items[0].response.next([{id:'A-item',componentName:'Synthetic A component'}]);t.items[0].response.complete();await t.render();
    expect(t.vm.selected?.id).toBe('B');expect(t.vm.selectedItems.map(i=>i.id)).toEqual(['B-item']);expect(t.vm.itemsLoading).toBe(false);
    expect(t.fixture.nativeElement.textContent).not.toContain('Synthetic A component');
  });
});
it('does not let an older detail error clear newer selected components or end their loading state',async()=>{
  const t=await setup();t.vm.setMode('STRUCTURES');t.vm.selectRow(structure('A'));t.vm.selectRow(structure('B'));
  t.items[0].response.error(new Error('Synthetic stale failure'));expect(t.vm.itemsLoading).toBe(true);
  t.items[1].response.next([{id:'B-item'}]);t.items[1].response.complete();expect(t.vm.selectedItems.map(i=>i.id)).toEqual(['B-item']);
});
it('ignores old run-status responses and clears prior rows during a new request',async()=>{
  const t=await setup();t.requests[0].response.next([run('old')]);t.requests[0].response.complete();
  t.vm.runStatusFilter='APPROVED';t.vm.loadRuns();expect(t.vm.runs).toEqual([]);
  t.vm.runStatusFilter='REJECTED';t.vm.loadRuns();t.requests[2].response.next([{...run('new'),status:'REJECTED'}]);t.requests[2].response.complete();
  t.requests[1].response.next([{...run('stale'),status:'APPROVED'}]);t.requests[1].response.complete();
  expect(t.vm.runs.map(r=>r.id)).toEqual(['new']);expect(t.vm.runsLoading).toBe(false);
});
it('protects a new structure filter from stale failures and finalizers',async()=>{
  const t=await setup();t.vm.setMode('STRUCTURES');t.vm.statusFilter='APPROVED';t.vm.load();
  t.requests[1].response.error(new Error('Synthetic stale failure'));expect(t.vm.loading).toBe(true);expect(t.error).not.toHaveBeenCalled();
  t.requests[2].response.next([structure('new')]);t.requests[2].response.complete();expect(t.vm.structures.map(r=>r.id)).toEqual(['new']);
});
it('clears selected detail on mode change and ignores its delayed result',async()=>{
  const t=await setup();t.vm.setMode('STRUCTURES');t.vm.selectRow(structure('A'));t.vm.setMode('RUNS');
  t.items[0].response.next([{id:'old-item'}]);t.items[0].response.complete();
  expect(t.vm.selected).toBeNull();expect(t.vm.selectedItems).toEqual([]);expect(t.vm.itemsLoading).toBe(false);
});
it('keeps a newer selected structure when a prior approval completes',async()=>{
  const t=await setup();t.vm.setMode('STRUCTURES');const a=structure('A');t.vm.selectRow(a);await t.vm.approve(a);
  t.vm.selectRow(structure('B'));t.items[1].response.next([{id:'B-item'}]);t.items[1].response.complete();
  const before=t.requests.length;t.action.next({});t.action.complete();
  expect(t.vm.selected?.id).toBe('B');expect(t.vm.selectedItems.map(i=>i.id)).toEqual(['B-item']);expect(t.requests).toHaveLength(before);
});
it('does not refresh an unrelated mode after a run approval finishes',async()=>{
  const t=await setup();const a=run('A');await t.vm.approveRun(a);t.vm.setMode('STRUCTURES');
  const before=t.requests.length;t.action.next({});t.action.complete();expect(t.requests).toHaveLength(before);expect(t.vm.mode).toBe('STRUCTURES');
});
