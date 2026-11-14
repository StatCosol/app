import '@angular/compiler';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { page } from 'vitest/browser';
import { ClientAppraisalApproveComponent } from './client-appraisal-approve.component';
import { BranchAppraisalFormComponent } from '../../branch/performance-appraisal/branch-appraisal-form.component';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { PageHeaderComponent } from '../../../shared/ui';

afterEach(() => TestBed.resetTestingModule());
describe.each([390, 768, 1440])('Appraisal review forms at %ipx', width => {
  beforeEach(async () => page.viewport(width, 900));
  for (const kind of ['Client', 'Branch']) it(`${kind} preserves another employee's typed draft after a delayed save and keeps failed send-back remarks`, async () => {
    const route = new BehaviorSubject(convertToParamMap({id:'TEST-A'})), pending = new Subject<any>(), failure = new Subject<any>();
    const row = (id:string):any => ({ id, status:kind === 'Client' ? 'BRANCH_REVIEWED' : 'MANAGER_REVIEWED', employee_name:'Synthetic '+id,
      items:[{id:id+'-ITEM',itemName:'Synthetic review criterion',weightage:100,managerRating:3,branchRating:4,managerRemarks:'Manager text',branchRemarks:'Branch text'}], approvals:[] });
    const svc = {getAppraisal:vi.fn((id:string)=>of(row(id))),clientApprove:vi.fn(()=>pending),branchReview:vi.fn(()=>pending),managerReview:vi.fn(()=>pending),sendBack:vi.fn(()=>failure)};
    const component:any = kind === 'Client' ? ClientAppraisalApproveComponent : BranchAppraisalFormComponent;
    await TestBed.configureTestingModule({imports:[component],providers:[provideRouter([]),{provide:ActivatedRoute,useValue:{paramMap:route,snapshot:{}}},{provide:PerformanceAppraisalService,useValue:svc}]})
      .overrideComponent(component,{remove:{imports:[PageHeaderComponent]},add:{schemas:[NO_ERRORS_SCHEMA]}}).compileComponents();
    const fixture=TestBed.createComponent<any>(component),c=fixture.componentInstance,dom=fixture.nativeElement as HTMLElement;
    const navigation=vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);
    const render=async()=>{fixture.changeDetectorRef.markForCheck();fixture.detectChanges();await fixture.whenStable();fixture.changeDetectorRef.markForCheck();fixture.detectChanges();};
    await render();
    const action=(label:string)=>dom.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    const note=()=>dom.querySelector<HTMLTextAreaElement>('textarea')!;
    if(kind === 'Branch') {
      const branchNote=dom.querySelector<HTMLInputElement>('input[placeholder="Branch remarks..."]')!;
      expect(branchNote.value).toBe('Branch text');branchNote.value='Typed branch remarks';branchNote.dispatchEvent(new Event('input'));await render();
    }
    action(kind === 'Client' ? 'Approve' : 'Submit Branch Review').click();await render();
    expect(note().disabled).toBe(true);
    if(kind === 'Branch') expect(svc.branchReview).toHaveBeenCalledWith('TEST-A',expect.objectContaining({items:[expect.objectContaining({remarks:'Typed branch remarks'})]}));
    route.next(convertToParamMap({id:'TEST-B'}));await render();
    note().value='Unsaved synthetic B';note().dispatchEvent(new Event('input'));await render();
    pending.next(row('TEST-A'));pending.complete();await render();
    expect(c.appraisal.id).toBe('TEST-B');expect(note().value).toBe('Unsaved synthetic B');expect(note().disabled).toBe(false);
    expect(navigation).not.toHaveBeenCalled();
    expect(note().getBoundingClientRect().right).toBeLessThanOrEqual(width+1);
    for(const button of Array.from(dom.querySelectorAll<HTMLButtonElement>('button[aria-label]'))) {
      expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(width+1);
    }
    svc.clientApprove.mockReturnValue(failure); action('Send Back').click();await render();failure.error(new Error('Synthetic failure'));await render();
    expect(dom.querySelector('[role="alert"]')?.textContent).toContain('Unable to save');expect(note().value).toBe('Unsaved synthetic B');expect(note().disabled).toBe(false);
    if(kind === 'Client') {
      svc.getAppraisal.mockImplementation(id => of({...row(id),status:'CLIENT_APPROVED'}));
      route.next(convertToParamMap({id:'TEST-C'}));await render();
      expect(action('Approve')).toBeNull();expect(action('Reject')).toBeNull();expect(action('Lock')).not.toBeNull();
    }
  });
});
