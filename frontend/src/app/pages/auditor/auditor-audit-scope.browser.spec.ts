import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
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
  const navigate=vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);
  // The intentional in-flight Subject keeps the component's timeout timer live.
  // Flush ngModel microtasks without waiting for that request to time out.
  const render=async()=>{fixture.changeDetectorRef.markForCheck();fixture.detectChanges();await Promise.resolve();fixture.detectChanges();};
  await render();
  const scope=async(value:string)=>{const select=fixture.nativeElement.querySelector('#auditor-record-scope') as HTMLSelectElement;select.value=value;select.dispatchEvent(new Event('change'));await render();};
  return {fixture,vm:fixture.componentInstance,requests,list,error,render,scope,navigate};
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
    const root=t.fixture.nativeElement as HTMLElement;expect(root.textContent).toContain('Test evidence only');
    expect(root.querySelectorAll('[data-testid="assigned-client"]')).toHaveLength(1);
    t.vm.selectClient('client-fixture');t.vm.selectBranch('__UNSPECIFIED__');await t.render();
    expect(root.textContent).toContain('AUD-TEST');expect(root.textContent).not.toContain('AUD-ACTUAL');
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

const assignedFixtures = [
  {...actual,id:'a1',auditCode:'A-UNH',clientId:'c1',clientName:'Client One',branchId:'b1',branchName:'Branch One',contractorUserId:'v1',contractorName:'UNH',auditType:'CONTRACTOR',periodCode:'2026-11'},
  {...actual,id:'a2',auditCode:'A-ARAX',clientId:'c1',clientName:'Client One',branchId:'b1',branchName:'Branch One',contractorUserId:'v2',contractorName:'Arax',auditType:'CONTRACTOR',periodCode:'2026-11'},
  {...actual,id:'a3',auditCode:'A-OLD',clientId:'c1',clientName:'Client One',branchId:'b1',branchName:'Branch One',contractorUserId:'v1',contractorName:'UNH',auditType:'CONTRACTOR',periodCode:'2026-10'},
  {...actual,id:'a4',auditCode:'A-B2',clientId:'c1',clientName:'Client One',branchId:'b2',branchName:'Branch Two',auditType:'SAFETY',periodCode:'2026-11'},
  {...actual,id:'a5',auditCode:'A-C2',clientId:'c2',clientName:'Client Two',branchId:'b3',branchName:'Branch Three',auditType:'FACTORY',periodCode:'2026-11'},
];

it.each([390,768,1440])('opens client, branch and exact contractor audit without selecting scope again at %ipx',async width=>{
  await page.viewport(width,900);const t=await setup();
  t.requests[0].next(assignedFixtures);t.requests[0].complete();await t.render();
  const root=t.fixture.nativeElement as HTMLElement;
  expect(root.querySelectorAll('[data-testid="assigned-client"]')).toHaveLength(2);
  expect(root.textContent).not.toContain('A-UNH');
  (Array.from(root.querySelectorAll('[data-testid="assigned-client"]')).find(card=>card.textContent?.includes('Client One'))!.querySelector('button') as HTMLButtonElement).click();await t.render();
  expect(t.vm.filters.clientId).toBe('c1');
  expect(root.querySelectorAll('[data-testid="assigned-branch"]')).toHaveLength(2);
  expect(root.textContent).not.toContain('Branch Three');
  await page.screenshot({path: '../../../../../docs/reviews/2026-11-28/assigned-branches-' + width + '.png'});
  (Array.from(root.querySelectorAll('[data-testid="assigned-branch"]')).find(card=>card.textContent?.includes('Branch One'))!.querySelector('button') as HTMLButtonElement).click();await t.render();
  expect(t.vm.filteredAudits.map(a=>a.id)).toEqual(['a1','a2','a3']);
  t.vm.filters.contractorUserId='v1';t.vm.filters.periodCode='2026-11';t.vm.onSearchChange();await t.render();
  expect(t.vm.filteredAudits.map(a=>a.id)).toEqual(['a1']);
  await page.screenshot({path: '../../../../../docs/reviews/2026-11-28/assigned-branch-audits-' + width + '.png'});
  const auditButton=Array.from(root.querySelectorAll('button')).find(b=>b.textContent?.trim()==='A-UNH')!;
  auditButton.click();await t.render();
  expect(t.navigate).toHaveBeenLastCalledWith(['/auditor/audits','a1','workspace'],expect.objectContaining({queryParams:expect.objectContaining({returnClientId:'c1',returnBranchId:'b1',returnContractorUserId:'v1',returnPeriodCode:'2026-11',tab:'documents',recordScope:'ACTUAL'})}));
  t.vm.selectBranch('b2');await t.render();
  expect(t.vm.filters.contractorUserId).toBe('');expect(t.vm.filteredAudits.map(a=>a.id)).toEqual(['a4']);
  t.vm.backToClients();await t.render();expect(t.vm.filters.clientId).toBe('');
  expect(root.querySelectorAll('[data-testid="assigned-client"]')).toHaveLength(2);
  for(const card of root.querySelectorAll<HTMLElement>('[data-testid="assigned-client"]'))expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(width);
  await page.screenshot({path: `../../../../../docs/reviews/2026-11-28/assigned-clients-${width}.png`});
});

it('restores the client, branch, contractor, period and test scope after returning or reloading',async()=>{
  const t=await setup({clientId:'c1',branchId:'b1',contractorUserId:'v2',periodCode:'2026-11',recordScope:'TEST'});
  t.requests[0].next(assignedFixtures);t.requests[0].complete();await t.render();
  expect(t.list).toHaveBeenCalledWith('TEST');expect(t.vm.filteredAudits.map(a=>a.id)).toEqual(['a2']);
  t.vm.clear();await t.render();expect(t.vm.filters.clientId).toBe('c1');expect(t.vm.filters.branchId).toBe('');
  expect(t.fixture.nativeElement.querySelectorAll('[data-testid="assigned-branch"]')).toHaveLength(2);
});

it('does not broaden an assignment whose branch is unavailable and retains filters on retry',async()=>{
  const t=await setup({clientId:'c1',branchId:'not-assigned'});t.requests[0].next(assignedFixtures);t.requests[0].complete();await t.render();
  expect(t.vm.filteredAudits).toEqual([]);t.vm.load();t.requests[1].error(new Error('network'));await t.render();
  expect(t.vm.loadError).toBe(true);expect(t.vm.filters.branchId).toBe('not-assigned');
  expect(t.fixture.nativeElement.textContent).toContain('Assignments could not be loaded');
  t.vm.load();t.requests[2].next(assignedFixtures);t.requests[2].complete();await t.render();expect(t.vm.loadError).toBe(false);expect(t.vm.filteredAudits).toEqual([]);
});

it('keeps all thirteen assigned audit types and periods accessible inside their branch',async()=>{
  const types=['CONTRACTOR','FACTORY','SAFETY','TRANSPORT','WAREHOUSE','E_MARKETING','OTHER','SHOPS_ESTABLISHMENT','LABOUR_EMPLOYMENT','FSSAI','HR','PAYROLL','GAP'];
  const t=await setup();t.requests[0].next(types.map((auditType,i)=>({...assignedFixtures[0],id:`type-${i}`,auditType})));t.requests[0].complete();await t.render();
  expect(t.vm.clientGroups).toHaveLength(1);t.vm.selectClient('c1');t.vm.selectBranch('b1');
  for(const type of types){t.vm.filters.auditType=type;t.vm.onAuditTypeChange();expect(t.vm.filteredAudits).toHaveLength(1);expect(t.vm.filteredAudits[0].auditType).toBe(type);}
});
