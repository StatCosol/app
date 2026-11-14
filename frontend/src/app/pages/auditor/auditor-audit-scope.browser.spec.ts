import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { AuditorAuditsComponent } from './auditor-audits.component';
import { AuditsService } from '../../core/audits.service';
import { ToastService } from '../../shared/toast/toast.service';

const actual = {id:'actual-fixture',auditCode:'AUD-ACTUAL',status:'IN_PROGRESS',clientName:'Synthetic normal-scope fixture',clientId:'client-fixture',auditType:'FACTORY'};
const test = {id:'test-fixture',auditCode:'AUD-TEST',status:'PLANNED',notes:'TEST ONLY fixture',clientName:'Synthetic test-scope fixture',clientId:'client-fixture',auditType:'FACTORY'};
afterEach(()=>TestBed.resetTestingModule());
async function setup(query:Record<string,string>={}) {
  const requests: Subject<any[]>[]=[];
  const list=vi.fn(()=>{const response=new Subject<any[]>();requests.push(response);return response;});
  const error=vi.fn();
  await TestBed.configureTestingModule({imports:[AuditorAuditsComponent],providers:[provideRouter([]),
    {provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:convertToParamMap(query)}}},
    {provide:AuditsService,useValue:{auditorListAllAudits:list}},{provide:ToastService,useValue:{error}},
  ]}).compileComponents();
  const fixture=TestBed.createComponent(AuditorAuditsComponent);
  // The intentional in-flight Subject keeps the component's timeout timer live.
  // Flush ngModel microtasks without waiting for that request to time out.
  const render=async()=>{fixture.changeDetectorRef.markForCheck();fixture.detectChanges();await Promise.resolve();fixture.detectChanges();};
  await render();
  const scope=async(value:string)=>{const select=fixture.nativeElement.querySelector('#auditor-record-scope') as HTMLSelectElement;select.value=value;select.dispatchEvent(new Event('change'));await render();};
  return {fixture,vm:fixture.componentInstance,requests,list,error,render,scope};
}

describe.each([390,768,1440])('Auditor actual/test queue at %ipx',width=>{
  beforeEach(async()=>page.viewport(width,900));
  it('defaults to actual and switches all queue totals with explicit test guidance',async()=>{
    const t=await setup();expect(t.list).toHaveBeenLastCalledWith('ACTUAL');
    t.requests[0].next([actual]);t.requests[0].complete();await t.render();
    expect(t.vm.totalAssignedCount).toBe(1);expect(t.vm.readyForAuditorCount).toBe(1);
    await t.scope('TEST');expect(t.list).toHaveBeenLastCalledWith('TEST');expect(t.vm.totalAssignedCount).toBe(0);
    t.requests[1].next([test,{...test,id:'test-closed',status:'CLOSED'}]);t.requests[1].complete();await t.render();
    expect(t.vm.totalAssignedCount).toBe(2);expect(t.vm.readyForAuditorCount).toBe(1);expect(t.vm.submittedOrClosedCount).toBe(1);
    const root=t.fixture.nativeElement as HTMLElement;expect(root.textContent).toContain('Test evidence only');expect(root.textContent).toContain('AUD-TEST');expect(root.textContent).not.toContain('AUD-ACTUAL');
    expect(root.querySelector('#auditor-record-scope')!.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    await t.scope('ACTUAL');t.requests[2].next([actual]);t.requests[2].complete();await t.render();
    expect(t.vm.totalAssignedCount).toBe(1);expect(root.textContent).not.toContain('Test evidence only');expect(root.textContent).not.toContain('AUD-TEST');
  });
});
it('ignores delayed test rows/errors after returning to actual scope',async()=>{
  const t=await setup();await t.scope('TEST');await t.scope('ACTUAL');
  t.requests[2].next([actual]);t.requests[2].complete();await t.render();
  t.requests[1].next([test]);t.requests[1].complete();t.requests[0].error(new Error('stale request'));await t.render();
  expect(t.vm.audits.map(x=>x.id)).toEqual(['actual-fixture']);expect(t.error).not.toHaveBeenCalled();expect(t.vm.loading).toBe(false);
});
it('clears old scope counts and rows when the new scope request fails',async()=>{
  const t=await setup();t.requests[0].next([actual]);t.requests[0].complete();await t.render();await t.scope('TEST');
  t.requests[1].error(new Error('synthetic failure'));await t.render();
  expect(t.vm.audits).toEqual([]);expect(t.vm.filteredAudits).toEqual([]);expect(t.vm.totalAssignedCount).toBe(0);expect(t.error).toHaveBeenCalled();
});
it('supports explicit test deep links without changing the default',async()=>{
  const t=await setup({recordScope:'TEST'});expect(t.list).toHaveBeenCalledWith('TEST');t.requests[0].complete();
});
it('preserves selected scope on every pagination request',()=>{
  TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),AuditsService]});
  const http=TestBed.inject(HttpTestingController),service=TestBed.inject(AuditsService);let rows:any[]=[];
  service.auditorListAllAudits('TEST').subscribe(value=>rows=value);
  const first=http.expectOne(r=>r.url.endsWith('/auditor/audits')&&r.params.get('page')==='1');expect(first.request.params.get('recordScope')).toBe('TEST');
  first.flush({data:[test],page:1,pageSize:250,total:251});
  const second=http.expectOne(r=>r.url.endsWith('/auditor/audits')&&r.params.get('page')==='2');expect(second.request.params.get('recordScope')).toBe('TEST');
  second.flush({data:[{...test,id:'page-two'}],page:2,pageSize:250,total:251});
  expect(rows.map(x=>x.id)).toEqual(['test-fixture','page-two']);http.verify();
});
