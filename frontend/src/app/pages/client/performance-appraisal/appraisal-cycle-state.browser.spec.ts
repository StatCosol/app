import '@angular/compiler';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { page } from 'vitest/browser';
import { ClientAppraisalCyclesComponent } from './client-appraisal-cycles.component';
import { BranchAppraisalCyclesComponent } from '../../branch/performance-appraisal/branch-appraisal-cycles.component';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { PageHeaderComponent } from '../../../shared/ui';

afterEach(()=>TestBed.resetTestingModule());
describe.each([390,768,1440])('Cycle workspace at %ipx',width=>{
 beforeEach(async()=>page.viewport(width,900));
 async function setup(component:any,svc:any){
  await TestBed.configureTestingModule({imports:[component],providers:[provideRouter([]),{provide:PerformanceAppraisalService,useValue:svc}]})
   .overrideComponent(component,{remove:{imports:[PageHeaderComponent]},add:{schemas:[NO_ERRORS_SCHEMA]}}).compileComponents();
  const f=TestBed.createComponent<any>(component),c=f.componentInstance,dom=f.nativeElement as HTMLElement;
  const render=async()=>{f.changeDetectorRef.markForCheck();f.detectChanges();await f.whenStable();f.changeDetectorRef.markForCheck();f.detectChanges();};
  await render();return{f,c,dom,render};
 }
 for(const kind of ['Client','Branch'])it(kind+' shows a retryable read failure instead of an empty cycle list',async()=>{
  const pending=new Subject<any>(),svc={getCycles:vi.fn(()=>pending)};
  const f=await setup(kind==='Client'?ClientAppraisalCyclesComponent:BranchAppraisalCyclesComponent,svc);
  pending.error(Error('Synthetic read failure'));await f.render();
  expect(f.dom.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');expect(f.dom.textContent).not.toContain('No cycles');
  const button=Array.from(f.dom.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()==='Retry')!;
  expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(width+1);
  svc.getCycles.mockReturnValue(of([]) as any);button.click();await f.render();expect(f.dom.querySelector('[role="alert"]')).toBeNull();expect(f.dom.textContent).toContain('No cycles');
 });
 it('keeps a newer creation draft and disables conflicting cycle actions',async()=>{
  const create=new Subject<any>(),action=new Subject<any>();
  const svc={getCycles:vi.fn(()=>of([{id:'TEST-A',cycleCode:'TEST',cycleName:'Synthetic cycle',financialYear:'2025-2026',appraisalType:'ANNUAL',status:'ACTIVE',reviewPeriodFrom:'2025-04-01',reviewPeriodTo:'2026-03-31',eligibleCount:1,completedCount:0,pendingCount:1}])),createCycle:vi.fn(()=>create),generateEmployees:vi.fn(()=>action),closeCycle:vi.fn(()=>action)};
  const f=await setup(ClientAppraisalCyclesComponent,svc);
  f.dom.querySelector<HTMLButtonElement>('[aria-label="Create Cycle"]')!.click();await f.render();
  const fields:Record<string,string>={'nc-code':'TEST-NEW','nc-name':'Synthetic first','nc-fy':'2025-2026','nc-from':'2025-04-01','nc-to':'2026-03-31'};
  for(const [id,value]of Object.entries(fields)){const el=f.dom.querySelector<HTMLInputElement>('#'+id)!;el.value=value;el.dispatchEvent(new Event('input'));}
  await f.render();f.dom.querySelector<HTMLButtonElement>('[aria-label="Create"]')!.click();await f.render();
  expect(f.dom.querySelector<HTMLButtonElement>('[aria-label="Create"]')!.disabled).toBe(true);
  expect(f.dom.querySelector<HTMLButtonElement>('[aria-label="Close Form"]')!.disabled).toBe(true);
  expect(f.dom.querySelector<HTMLButtonElement>('[aria-label="Generate"]')!.disabled).toBe(true);
  const name=f.dom.querySelector<HTMLInputElement>('#nc-name')!;name.value='Synthetic next';name.dispatchEvent(new Event('input'));await f.render();
  create.next({id:'CREATED'});create.complete();await f.render();
  expect(f.dom.querySelector<HTMLInputElement>('#nc-name')!.value).toBe('Synthetic next');
  expect(f.dom.textContent).toContain('newer form edits have been kept');
  expect(name.getBoundingClientRect().right).toBeLessThanOrEqual(width+1);
  f.dom.querySelector<HTMLButtonElement>('[aria-label="Generate"]')!.click();await f.render();
  const close=Array.from(f.dom.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()==='Close')!;
  expect(close.disabled).toBe(true);close.click();expect(svc.closeCycle).not.toHaveBeenCalled();
  action.error(Error('Synthetic conflict'));await f.render();
  expect(f.dom.querySelector('[role="alert"]')?.textContent).toContain('Cycle action failed');
  expect(f.dom.querySelector<HTMLInputElement>('#nc-name')!.value).toBe('Synthetic next');
 });
});

