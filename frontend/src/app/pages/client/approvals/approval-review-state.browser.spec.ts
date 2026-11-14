import '@angular/compiler';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { page } from 'vitest/browser';
import { LeaveApprovalsComponent } from './leave-approvals.component';
import { NominationApprovalsComponent } from './nomination-approvals.component';
import { ClientUnifiedApprovalsComponent } from './client-unified-approvals.component';
import { BranchApprovalsApiService } from './branch-approvals-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { PageHeaderComponent } from '../../../shared/ui';
import { BranchFilterComponent } from '../../../shared/ui/branch-filter/branch-filter.component';

const row=(id:string)=>({id,employeeId:id,employeeName:'Synthetic '+id,leaveTypeCode:'CL',fromDate:'2026-01-01',toDate:'2026-01-01',numberOfDays:1,nominationType:'EPF',status:'PENDING'});
afterEach(()=>TestBed.resetTestingModule());
describe.each([390,768,1440])('Employee approval forms at %ipx',width=>{
 beforeEach(async()=>page.viewport(width,900));
 for(const kind of ['leave','nomination']) it(`${kind}: keeps another typed rejection reason while the first save finishes; reports load failure`,async()=>{
  const a=row('TEST-A'),b=row('TEST-B'),pending=new Subject<any>(),list=vi.fn(()=>of([a,b])),reject=vi.fn(()=>pending);
  const api={listPendingLeaves:list,listPendingNominations:list,rejectLeave:reject,rejectNomination:reject};
  const component:any=kind==='leave'?LeaveApprovalsComponent:NominationApprovalsComponent;
  await TestBed.configureTestingModule({imports:[component],providers:[{provide:BranchApprovalsApiService,useValue:api},{provide:ToastService,useValue:{error:vi.fn()}}]})
   .overrideComponent(component,{remove:{imports:[PageHeaderComponent]},add:{schemas:[NO_ERRORS_SCHEMA]}}).compileComponents();
  const fixture=TestBed.createComponent<any>(component),c=fixture.componentInstance,dom=fixture.nativeElement as HTMLElement;
  const render=async()=>{fixture.changeDetectorRef.markForCheck();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();};
  await render();(dom.querySelectorAll<HTMLButtonElement>('[title="Reject"]')[0]).click();await render();
  const input=()=>dom.querySelector('textarea') as HTMLTextAreaElement;
  input().value='Synthetic A reason';input().dispatchEvent(new Event('input'));await render();
  const confirm=()=>Array.from(dom.querySelectorAll('button')).find(b=>b.textContent?.trim().startsWith('Confirm'))!;
  confirm().click();await render();expect(confirm().disabled).toBe(true);
  dom.querySelectorAll<HTMLButtonElement>('[title="Reject"]')[1].click();await render();
  input().value='Unsaved synthetic B';input().dispatchEvent(new Event('input'));await render();
  pending.next({});pending.complete();await render();expect(c.rejectId).toBe('TEST-B');expect(input().value).toBe('Unsaved synthetic B');
  expect(dom.querySelectorAll('[title="Reject"]')).toHaveLength(1);
  const read=new Subject<any>();list.mockReturnValue(read as any);c.load();read.error(new Error('Synthetic outage'));await render();
  expect(dom.querySelector('[role="alert"]')?.textContent).toContain('Could not load');expect(dom.textContent).not.toContain('No pending');
  list.mockReturnValue(of([]));Array.from(dom.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Retry')!.click();await render();
  expect(dom.textContent).toContain('No pending');expect(dom.querySelector('[role="alert"]')).toBeNull();
 });
 it('unified view preserves the selected request and typed notes after another request is approved',async()=>{
  const pending=new Subject<any>(),rejection=new Subject<any>(),api={listPendingLeaves:vi.fn(()=>of([row('TEST-A'),row('TEST-B')])),listPendingNominations:()=>of([]),approveLeave:vi.fn(()=>pending),rejectLeave:vi.fn(()=>rejection)};
  await TestBed.configureTestingModule({imports:[ClientUnifiedApprovalsComponent],providers:[{provide:BranchApprovalsApiService,useValue:api},{provide:ToastService,useValue:{error:vi.fn(),success:vi.fn(),info:vi.fn()}}]})
   .overrideComponent(ClientUnifiedApprovalsComponent,{remove:{imports:[PageHeaderComponent,BranchFilterComponent]},add:{schemas:[NO_ERRORS_SCHEMA]}}).compileComponents();
  const fixture=TestBed.createComponent(ClientUnifiedApprovalsComponent),c=fixture.componentInstance,dom=fixture.nativeElement as HTMLElement;
  const render=async()=>{fixture.changeDetectorRef.markForCheck();fixture.detectChanges();await fixture.whenStable();fixture.changeDetectorRef.markForCheck();fixture.detectChanges();};
  await render();c.select(c.queue[0]);c.approveSelected();c.select(c.queue[1]);await render();
  const field=dom.querySelector('#cua-decision-notes') as HTMLTextAreaElement;field.value='Unsaved synthetic B';field.dispatchEvent(new Event('input'));await render();
  pending.next({});pending.complete();await render();expect(c.selected?.id).toBe('TEST-B');expect(field.value).toBe('Unsaved synthetic B');expect(c.allCount).toBe(1);
  expect(field.getBoundingClientRect().right).toBeLessThanOrEqual(width+1);
  const reject=()=>Array.from(dom.querySelectorAll<HTMLButtonElement>('button')).find(button=>button.getAttribute('aria-label')==='Reject')!;
  reject().click();await render();expect(api.rejectLeave).not.toHaveBeenCalled();
  const reason=dom.querySelector('#cua-rejection-reason') as HTMLTextAreaElement;expect(reason).not.toBeNull();
  reason.value='Synthetic rejection';reason.dispatchEvent(new Event('input'));await render();reject().click();await render();
  expect(api.rejectLeave).toHaveBeenCalledWith('TEST-B','Synthetic rejection');expect(reject().disabled).toBe(true);
  rejection.error(new Error('Synthetic rejection outage'));await render();expect(reason.value).toBe('Synthetic rejection');expect(reject().disabled).toBe(false);
  const failedRead=new Subject<any>();api.listPendingLeaves.mockReturnValue(failedRead as any);c.load();failedRead.error(new Error('Synthetic list outage'));await render();
  expect(dom.textContent).toContain('Unavailable');expect(dom.textContent).not.toContain('No pending approvals');
  api.listPendingLeaves.mockReturnValue(of([]));Array.from(dom.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Retry')!.click();await render();
  expect(dom.textContent).not.toContain('Unavailable');expect(dom.textContent).toContain('No pending approvals');
 });
});
