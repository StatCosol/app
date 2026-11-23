import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuditorObservationsComponent } from './auditor-observations.component';
import { AuditorObservationsService } from '../../../core/auditor-observations.service';
import { AuditsService } from '../../../core/audits.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';

afterEach(()=>TestBed.resetTestingModule());
async function setup(query:Record<string,string>={}) {
  const pending:Subject<any[]>[]=[];
  const auditLists:Subject<any[]>[]=[];
  const exportResponse=new Subject<Blob>();
  const api={list:vi.fn(()=>{const response=new Subject<any[]>();pending.push(response);return response;}),listCategories:()=>of([]),exportAuditObservationsPdf:vi.fn(()=>exportResponse)};
  await TestBed.configureTestingModule({imports:[AuditorObservationsComponent],providers:[provideRouter([]),
    {provide:ActivatedRoute,useValue:{paramMap:of(convertToParamMap({})),queryParamMap:of(convertToParamMap(query))}},
    {provide:AuditorObservationsService,useValue:api},
    {provide:AuditsService,useValue:{auditorListAllAudits:()=>{const result=new Subject<any[]>();auditLists.push(result);return result;}}},
    {provide:ToastService,useValue:{success:vi.fn(),warning:vi.fn(),error:vi.fn()}},
    {provide:ProtectedFileService,useValue:{open:()=>of(undefined)}},
  ]}).compileComponents();
  const fixture=TestBed.createComponent(AuditorObservationsComponent);
  const render=async()=>{fixture.changeDetectorRef.markForCheck();fixture.detectChanges();await Promise.resolve();fixture.detectChanges();};
  await render();
  const scope=async(value:string)=>{const element=fixture.nativeElement.querySelector('[aria-label="Correction record scope"]') as HTMLSelectElement;element.value=value;element.dispatchEvent(new Event('change'));await render();};
  return {fixture,vm:fixture.componentInstance,api,pending,auditLists,exportResponse,render,scope,root:fixture.nativeElement as HTMLElement};
}
it.each(['audit-list-first','findings-first'])('exports test findings on actual audits with %s responses',async order=>{
  const t=await setup({recordScope:'TEST'});
  const rows=['actual-a','actual-b'].map(id=>({id:'test-'+id,auditId:id,isTest:true,status:'CLOSED',observation:'TEST ONLY fixture',audit:{id,auditCode:id,client:{name:'Synthetic client'}}}));
  if(order==='audit-list-first'){t.auditLists[0].next([]);t.auditLists[0].complete();}
  t.pending[0].next(rows);t.pending[0].complete();
  if(order==='findings-first'){t.auditLists[0].next([]);t.auditLists[0].complete();}
  await t.render();
  const select=t.root.querySelector('#ao-filter-audit-id') as HTMLSelectElement;
  expect([...select.options].map(o=>o.value)).toContain('actual-a');
  select.value='actual-a';select.dispatchEvent(new Event('change'));await t.render();
  expect(t.api.list).toHaveBeenLastCalledWith('actual-a','TEST');
  t.pending[1].next([rows[0]]);t.pending[1].complete();await t.render();
  expect([...select.options].map(o=>o.value)).toContain('actual-b');
  expect(t.vm.selectedAudit.id).toBe('actual-a');
  (t.root.querySelector('[aria-label="Export PDF"]') as HTMLButtonElement).click();
  expect(t.api.exportAuditObservationsPdf).toHaveBeenCalledWith('actual-a','TEST');
  await t.scope('ACTUAL');
  expect([...select.options].map(o=>o.value)).not.toContain('actual-a');
});
it('sends the same test scope to the list and PDF endpoints',()=>{
  TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),AuditorObservationsService]});
  const http=TestBed.inject(HttpTestingController),service=TestBed.inject(AuditorObservationsService);
  service.list('audit-test','TEST').subscribe();
  const list=http.expectOne(r=>r.url.endsWith('/observations'));
  expect(list.request.params.get('recordScope')).toBe('TEST'); list.flush([]);
  service.exportAuditObservationsPdf('audit-test','TEST').subscribe();
  const pdf=http.expectOne(r=>r.url.endsWith('/audit/audit-test/export'));
  expect(pdf.request.params.get('recordScope')).toBe('TEST');pdf.flush(new Blob(['test']));http.verify();
});
it('keeps a delayed export named for its requested audit and scope',async()=>{
  const t=await setup({auditId:'old-test',recordScope:'TEST'});
  t.pending[0].next([]);t.pending[0].complete();await t.render();
  let filename='';
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){filename=this.download;});
  try {
    t.vm.exportPdf(); expect(t.api.exportAuditObservationsPdf).toHaveBeenCalledWith('old-test','TEST');
    t.vm.filterAuditId='new-actual';t.vm.recordScope='ACTUAL';
    t.exportResponse.next(new Blob(['synthetic pdf']));t.exportResponse.complete();
    expect(filename).toBe('observations-TEST-old-test.pdf');
  } finally {click.mockRestore();}
});
describe.each([390,768,1440])('Auditor correction isolation at %ipx',width=>{
  beforeEach(async()=>page.viewport(width,900));
  it('changes scope, clears selection and counts, and preserves separate test history',async()=>{
    const t=await setup(); expect(t.api.list).toHaveBeenLastCalledWith(undefined,'ACTUAL');
    t.pending[0].next([{id:'actual',auditId:'a',observation:'Synthetic normal-scope fixture',status:'OPEN'}]);t.pending[0].complete();await t.render();
    expect(t.vm.openCount).toBe(1);t.vm.verificationNotes='Unsubmitted draft';
    await t.scope('TEST');expect(t.vm.selected).toBeNull();expect(t.vm.openCount).toBe(0);expect(t.vm.verificationNotes).toBe('');
    expect(t.api.list).toHaveBeenLastCalledWith(undefined,'TEST');
    t.pending[1].next([{id:'test',auditId:'b',observation:'TEST ONLY synthetic finding',isTest:true,status:'CLOSED'}]);t.pending[1].complete();await t.render();
    expect(t.root.textContent).toContain('Test evidence only');expect(t.root.textContent).toContain('TEST ONLY synthetic finding');expect(t.vm.closedCount).toBe(1);
    const select=t.root.querySelector('[aria-label="Correction record scope"]')!;
    expect(select.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    await t.scope('ACTUAL');t.pending[2].error(new Error('isolated failure'));await t.render();
    expect(t.vm.observations).toEqual([]);expect(t.vm.closedCount).toBe(0);expect(t.root.textContent).toContain('Observations could not be loaded');
    expect(t.vm.canVerifyClosure).toBe(false);
  });
  it('labels an explicit test audit history without claiming it is the actual queue',async()=>{
    const t=await setup({auditId:'test-audit'});
    expect(t.api.list).toHaveBeenLastCalledWith('test-audit',undefined);
    t.pending[0].next([{id:'test',auditId:'test-audit',isTest:true,status:'CLOSED',observation:'TEST ONLY history'}]);t.pending[0].complete();await t.render();
    const scope=t.root.querySelector('[aria-label="Correction record scope"]') as HTMLSelectElement;
    expect(scope.value).toBe('AUDIT');expect(t.root.textContent).toContain("selected audit's history");
    await t.scope('ACTUAL');expect(t.vm.filterAuditId).toBe('');expect(t.api.list).toHaveBeenLastCalledWith(undefined,'ACTUAL');
  });
});
