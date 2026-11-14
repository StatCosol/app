import '@angular/compiler';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { page } from 'vitest/browser';
import { ClientAppraisalsListComponent } from './client-appraisals-list.component';
import { BranchAppraisalsListComponent } from '../../branch/performance-appraisal/branch-appraisals-list.component';
import { ClientAppraisalReportsComponent } from './client-appraisal-reports.component';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { PageHeaderComponent } from '../../../shared/ui';

afterEach(()=>TestBed.resetTestingModule());
describe.each([390,768,1440])('Appraisal lists and reports at %ipx',width=>{
 beforeEach(async()=>page.viewport(width,900));
 for(const kind of ['Client','Branch']) it(`${kind} restarts filtered pagination and renders a failed read separately from an empty result`,async()=>{
  const svc={getCycles:()=>of([]),getAppraisals:vi.fn(()=>of({data:[],total:0}))};
  const component:any=kind==='Client'?ClientAppraisalsListComponent:BranchAppraisalsListComponent;
  await TestBed.configureTestingModule({imports:[component],providers:[provideRouter([]),{provide:PerformanceAppraisalService,useValue:svc}]})
   .overrideComponent(component,{remove:{imports:[PageHeaderComponent]},add:{schemas:[NO_ERRORS_SCHEMA]}}).compileComponents();
  const fixture=TestBed.createComponent<any>(component),c=fixture.componentInstance,dom=fixture.nativeElement as HTMLElement;
  const render=async()=>{fixture.changeDetectorRef.markForCheck();fixture.detectChanges();await fixture.whenStable();fixture.changeDetectorRef.markForCheck();fixture.detectChanges();};
  await render();expect(dom.textContent).toContain('No appraisals found');
  const pending=new Subject<any>();svc.getAppraisals.mockReturnValueOnce(pending as any);c.page=4;
  const select=dom.querySelector<HTMLSelectElement>(kind==='Client'?'#c-status':'#status-filter')!;select.value='INITIATED';select.dispatchEvent(new Event('change'));await render();
  expect(svc.getAppraisals).toHaveBeenLastCalledWith(expect.objectContaining({page:1,status:'INITIATED'}));
  pending.error(new Error('Synthetic read failure'));await render();
  expect(dom.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');expect(dom.textContent).not.toContain('No appraisals found');expect(dom.textContent).not.toContain('0 records');
  const retry=Array.from(dom.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()==='Retry')!;expect(retry.getBoundingClientRect().right).toBeLessThanOrEqual(width+1);retry.click();await render();
  expect(dom.textContent).toContain('No appraisals found');expect(dom.querySelector('[role="alert"]')).toBeNull();
 });
 it('report failures settle, retry recovers, zero scores render and old-cycle exports are ignored',async()=>{
  const pending=new Subject<any>(),exportRead=new Subject<any>();
  const svc={getCycles:()=>of([{id:'TEST-A',cycleName:'Synthetic A',financialYear:'2025-26'},{id:'TEST-B',cycleName:'Synthetic B',financialYear:'2025-26'}]),getBranchSummary:vi.fn(()=>of([])),getDepartmentSummary:()=>of([]),getRecommendations:()=>of([]),exportAppraisals:vi.fn(()=>exportRead)};
  await TestBed.configureTestingModule({imports:[ClientAppraisalReportsComponent],providers:[provideRouter([]),{provide:PerformanceAppraisalService,useValue:svc}]})
   .overrideComponent(ClientAppraisalReportsComponent,{remove:{imports:[PageHeaderComponent]},add:{schemas:[NO_ERRORS_SCHEMA]}}).compileComponents();
  const fixture=TestBed.createComponent(ClientAppraisalReportsComponent),c=fixture.componentInstance,dom=fixture.nativeElement as HTMLElement;
  const download=vi.spyOn(c as any,'downloadRows').mockImplementation(()=>{});
  const render=async()=>{fixture.changeDetectorRef.markForCheck();fixture.detectChanges();await fixture.whenStable();fixture.changeDetectorRef.markForCheck();fixture.detectChanges();};
  await render();expect(dom.textContent).toContain('No appraisal results');
  const select=dom.querySelector<HTMLSelectElement>('#r-cycle')!,exportButton=dom.querySelector<HTMLButtonElement>('[aria-label="Export Data"]')!;
  svc.getBranchSummary.mockReturnValueOnce(pending as any);select.value='TEST-A';select.dispatchEvent(new Event('change'));await render();expect(exportButton.disabled).toBe(true);
  pending.error(new Error('Synthetic report outage'));await render();expect(dom.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');expect(dom.textContent).not.toContain('No appraisal results');expect(exportButton.disabled).toBe(true);
  svc.getBranchSummary.mockReturnValue(of([{branch_name:'Synthetic branch',total:1,completed:1,avg_score:0,increment_count:0,promotion_count:0,pip_count:0}]) as any);
  Array.from(dom.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()==='Retry')!.click();await render();expect(dom.querySelector('[role="alert"]')).toBeNull();expect(dom.querySelectorAll('tbody tr td')[4].textContent?.trim()).toBe('0');
  expect(select.getBoundingClientRect().right).toBeLessThanOrEqual(width+1);expect(exportButton.getBoundingClientRect().right).toBeLessThanOrEqual(width+1);
  exportButton.click();await render();expect(exportButton.disabled).toBe(true);select.value='TEST-B';select.dispatchEvent(new Event('change'));await render();exportRead.next([{employee:'Synthetic A'}]);exportRead.complete();await render();expect(download).not.toHaveBeenCalled();
 });
});
