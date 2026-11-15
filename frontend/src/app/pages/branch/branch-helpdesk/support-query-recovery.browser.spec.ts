import '@angular/compiler';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { CreateQueryComponent } from '../../../shared/notifications/create-query/create-query.component';
import { NotificationsService } from '../../../core/notifications.service';
import { BranchHelpdeskComponent } from './branch-helpdesk.component';
import { BranchThreadApiService } from '../../../core/branch-thread-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ThreadLayoutComponent } from '../../../shared/thread';
import { PageHeaderComponent } from '../../../shared/ui';

afterEach(() => TestBed.resetTestingModule());
describe.each([390,768,1440])('Support forms at %ipx', width => {
  beforeEach(async()=>page.viewport(width,900));
  async function setup(branch=false) {
    const save=new Subject<any>();
    const api={createQuery:vi.fn(()=>save),createTicket:vi.fn(()=>save),list:vi.fn(()=>of({items:[],total:0}))};
    const toast={success:vi.fn(),error:vi.fn()};
    const type=branch?BranchHelpdeskComponent:CreateQueryComponent;
    TestBed.configureTestingModule({imports:[type],providers:[provideRouter([]),{provide:NotificationsService,useValue:api},{provide:BranchThreadApiService,useValue:api},{provide:ToastService,useValue:toast}]});
    if(branch)TestBed.overrideComponent(BranchHelpdeskComponent,{remove:{imports:[ThreadLayoutComponent,PageHeaderComponent]},add:{schemas:[NO_ERRORS_SCHEMA]}});
    await TestBed.compileComponents();
    const f=TestBed.createComponent(type as typeof CreateQueryComponent),dom=f.nativeElement as HTMLElement;
    const render=async()=>{f.changeDetectorRef.markForCheck();f.detectChanges();await f.whenStable();f.changeDetectorRef.markForCheck();f.detectChanges();};
    const input=async(id:string,value:string)=>{const el=dom.querySelector<HTMLInputElement>('#'+id)!;el.value=value;el.dispatchEvent(new Event('input'));await render();};
    await render(); return{f,dom,render,input,save,api,toast};
  }
  it('keeps newer query edits after success and labels the submit action',async()=>{
    const t=await setup();await t.input('cq-subject','TEST query');await t.input('cq-message','Synthetic first');
    const button=t.dom.querySelector<HTMLButtonElement>('ui-button button')!;expect(button.textContent).toContain('Submit Query');button.click();await t.render();expect(button.disabled).toBe(true);
    await t.input('cq-message','Synthetic next');t.save.next({});t.save.complete();await t.render();
    expect(t.dom.querySelector<HTMLTextAreaElement>('#cq-message')!.value).toBe('Synthetic next');expect(t.dom.querySelector('[role="status"]')?.textContent).toContain('newer');
    expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(width+1);
  });
  it('shows failed submissions as errors and supports retry with the same inputs',async()=>{
    const t=await setup();await t.input('cq-message','Synthetic retry');
    const button=t.dom.querySelector<HTMLButtonElement>('ui-button button')!;button.click();await t.render();t.save.error(Error('Synthetic outage'));await t.render();
    expect(t.dom.querySelector('[role="alert"]')?.classList.contains('alert-danger')).toBe(true);expect(t.dom.querySelector('.alert-success')).toBeNull();expect(button.disabled).toBe(false);
    const retry=new Subject<any>();t.api.createQuery.mockReturnValue(retry);button.click();await t.render();retry.next({});retry.complete();await t.render();expect(t.dom.querySelector('[role="status"]')?.textContent).toBe('Query submitted.');
  });
  it('keeps the newer Branch editor open and prevents hiding a pending submission',async()=>{
    const t=await setup(true);t.dom.querySelector<HTMLButtonElement>('[aria-label="Raise Ticket"]')!.click();await t.render();
    await t.input('bh-subject','TEST branch');await t.input('bh-message','Synthetic first');
    const submit=t.dom.querySelector<HTMLButtonElement>('button[type="submit"]')!;submit.click();await t.render();
    expect(t.dom.querySelector<HTMLButtonElement>('[aria-label="Hide Form"]')!.disabled).toBe(true);
    await t.input('bh-message','Synthetic next');t.save.next({});t.save.complete();await t.render();
    expect(t.dom.querySelector<HTMLTextAreaElement>('#bh-message')!.value).toBe('Synthetic next');expect(submit.disabled).toBe(false);
    expect(submit.getBoundingClientRect().right).toBeLessThanOrEqual(width+1);
  });
});
