import '@angular/compiler';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { Subject, of } from 'rxjs';
import { page } from 'vitest/browser';
import { PayrollFnfComponent } from './payroll-fnf.component';
import { PayrollApiService } from './payroll-api.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ClientContextStripComponent } from '../../shared/ui/client-context-strip/client-context-strip.component';
import { PageHeaderComponent } from '../../shared/ui';

const row=(id:string,amount:number)=>({id,employeeName:'Synthetic '+id,clientName:'Synthetic client',clientId:'TEST-CLIENT',status:'INITIATED',settlementAmount:amount,settlementBreakup:{pendingSalary:amount}});
afterEach(()=>TestBed.resetTestingModule());
describe.each([390,768,1440])('Full and final case drafts at %ipx',width=>{
 beforeEach(async()=>page.viewport(width,900));
 it('keeps latest detail and newer typed draft while a previous case save finishes',async()=>{
  const rows=[row('TEST-A',100),row('TEST-B',200)],details:{id:string,response:Subject<any>}[]=[],save=new Subject<any>();
  const api={getAssignedClients:()=>of([]),getFullAndFinalCases:()=>of({data:rows,total:2}),
   getFullAndFinalCaseById:vi.fn((id:string)=>{const response=new Subject<any>();details.push({id,response});return response;}),
   listFnfDocuments:()=>of([]),saveFnfBreakup:vi.fn(()=>save)};
  await TestBed.configureTestingModule({imports:[PayrollFnfComponent],providers:[
   {provide:PayrollApiService,useValue:api},{provide:ToastService,useValue:{success:vi.fn(),error:vi.fn()}},
   {provide:ConfirmDialogService,useValue:{}},{provide:ActivatedRoute,useValue:{snapshot:{paramMap:{get:()=>null}}}},
  ]}).overrideComponent(PayrollFnfComponent,{remove:{imports:[ClientContextStripComponent,PageHeaderComponent]},add:{schemas:[NO_ERRORS_SCHEMA]}}).compileComponents();
  const fixture=TestBed.createComponent(PayrollFnfComponent),c=fixture.componentInstance;
  const render=async()=>{fixture.changeDetectorRef.markForCheck();fixture.detectChanges();await fixture.whenStable();fixture.changeDetectorRef.markForCheck();fixture.detectChanges();};
  await render();const dom=fixture.nativeElement as HTMLElement;
  (dom.querySelectorAll('tbody tr')[1] as HTMLElement).click();await render();
  details[1].response.next(rows[1]);details[1].response.complete();details[0].response.next(rows[0]);details[0].response.complete();await render();
  expect(c.selectedCase?.id).toBe('TEST-B');let input=dom.querySelector('#pf-pending-salary') as HTMLInputElement;
  expect(input.value).toBe('200');input.value='321';input.dispatchEvent(new Event('input'));await render();
  const saveButton=Array.from(dom.querySelectorAll('button')).find(button=>button.textContent?.includes('Save Breakup'))!;
  saveButton.click();await render();expect(api.saveFnfBreakup).toHaveBeenCalledTimes(1);
  expect((dom.querySelector('[title="Approve"]') as HTMLButtonElement).disabled).toBe(true);
  expect(Array.from(dom.querySelectorAll<HTMLButtonElement>('.status-actions button')).find(button=>button.textContent?.includes('Under Review'))!.disabled).toBe(true);
  // Selecting another case remains available while a write is pending.
  (dom.querySelectorAll('tbody tr')[0] as HTMLElement).click();await render();
  details[2].response.next(rows[0]);details[2].response.complete();await render();
  input=dom.querySelector('#pf-pending-salary') as HTMLInputElement;input.value='888';input.dispatchEvent(new Event('input'));await render();
  save.next({settlementAmount:321});save.complete();await render();
  expect(c.selectedCase?.id).toBe('TEST-A');expect((dom.querySelector('#pf-pending-salary') as HTMLInputElement).value).toBe('888');
  expect(details).toHaveLength(3);expect((dom.querySelector('[title="Approve"]') as HTMLButtonElement).disabled).toBe(false);
  expect(input.getBoundingClientRect().right).toBeLessThanOrEqual(width+1);
 });
});

