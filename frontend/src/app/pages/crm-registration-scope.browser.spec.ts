import '@angular/compiler';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { page } from 'vitest/browser';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { CrmRegistrationsComponent } from './crm/registrations/crm-registrations.component';
import { ClientBranchesService } from '../core/client-branches.service';
import { CrmClientsApi } from '../core/api/crm-clients.api';
import { ToastService } from '../shared/toast/toast.service';
import { ConfirmDialogService } from '../shared/ui/confirm-dialog/confirm-dialog.service';
import { ClientContextStripComponent } from '../shared/ui';
import { ProtectedFileService } from '../shared/files/services/protected-file.service';

const actual = {id:'actual-fixture',type:'Factory License',registrationNumber:'FL-100',computedStatus:'ACTIVE'};
const test = {id:'test-fixture',type:'TEST ONLY registration',registrationNumber:'TEST-ONLY-20261014',computedStatus:'ACTIVE',documentUrl:'/uploads/test-original.txt',renewalDocumentUrl:'/uploads/test-renewal.txt'};
afterEach(() => TestBed.resetTestingModule());
async function setup() {
  const params = new BehaviorSubject(convertToParamMap({clientId:'client-a'}));
  const requests: Subject<any[]>[] = [];
  const list = vi.fn(() => {const request = new Subject<any[]>(); requests.push(request); return request;});
  const branches = vi.fn(() => of([{id:'branch-a',name:'BRM fixture'},{id:'branch-b',name:'Second fixture'}]));
  const fetch = vi.fn().mockReturnValue(of({blob:new Blob(['Synthetic evidence'],{type:'text/plain'}),objectUrl:'',fileName:'test.txt',mimeType:'text/plain',revoke:vi.fn()}));
  await TestBed.configureTestingModule({imports:[CrmRegistrationsComponent],providers:[
    {provide:ActivatedRoute,useValue:{paramMap:params}},
    {provide:ClientBranchesService,useValue:{crmListRegistrations:list}},
    {provide:CrmClientsApi,useValue:{getBranchesForClient:branches}},
    {provide:ToastService,useValue:{}},{provide:ConfirmDialogService,useValue:{}},
    {provide:ProtectedFileService,useValue:{fetch}},
  ]}).overrideComponent(CrmRegistrationsComponent,{remove:{imports:[ClientContextStripComponent]},add:{schemas:[NO_ERRORS_SCHEMA]}}).compileComponents();
  const fixture = TestBed.createComponent(CrmRegistrationsComponent);
  const render = async () => {fixture.changeDetectorRef.markForCheck();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();};
  await render();
  const select = async (id:string,value:string) => {
    const el = fixture.nativeElement.querySelector(id) as HTMLSelectElement;
    el.value = value;el.dispatchEvent(new Event('change'));await render();
  };
  return {fixture,vm:fixture.componentInstance,requests,list,params,branches,fetch,render,select};
}

describe.each([390,768,1440])('registration scope at %ipx',width => {
  beforeEach(async()=>page.viewport(width,900));
  it('defaults to actual, keeps test counts separate and preserves original/renewal preview',async()=>{
    const t=await setup();
    expect(t.list).toHaveBeenLastCalledWith('branch-a','client-a','ACTUAL');
    t.requests[0].next([actual]);await t.render();
    expect(t.vm.active).toBe(1);
    await t.select('#cr-record-scope','TEST');
    expect(t.list).toHaveBeenLastCalledWith('branch-a','client-a','TEST');
    expect(t.vm.rows).toEqual([]);expect(t.vm.active).toBe(0);
    t.requests[1].next([test]);await t.render();
    const root=t.fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Test evidence only');
    expect(root.querySelector('[aria-label="Add"]')).toBeNull();
    expect(root.querySelector('[aria-label="Edit"]')).toBeNull();
    expect(root.querySelector('input[type="file"]')).toBeNull();
    expect(root.querySelector('select')!.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    expect(root.querySelector('.strip')!.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    for (const url of [test.documentUrl,test.renewalDocumentUrl]) {
      const buttons = [...root.querySelectorAll('button')];
      const preview = url === test.documentUrl
        ? root.querySelector('[aria-label="View"]') as HTMLButtonElement
        : buttons.find(b => b.textContent?.includes('Renewal'))!;
      preview.click();await t.render();
      expect(t.fetch).toHaveBeenLastCalledWith(url,url.split('/').pop());
      expect(document.querySelector('[aria-label="Document preview"]')).not.toBeNull();
      (document.querySelector('[aria-label="Close preview"]') as HTMLButtonElement).click();await t.render();
    }
    await t.select('#cr-record-scope','ACTUAL');
    t.requests[2].next([actual]);await t.render();
    expect(root.textContent).not.toContain(test.registrationNumber);
    expect(root.querySelector('[aria-label="Add"]')).not.toBeNull();
  });
  it('ignores an old scope response and clears previous counts when the new request fails',async()=>{
    const t=await setup();
    t.requests[0].next([actual]);await t.render();
    await t.select('#cr-record-scope','TEST');
    await t.select('#cr-record-scope','ACTUAL');
    t.requests[1].next([test]);await t.render();
    expect(t.vm.rows).toEqual([]);
    t.requests[2].error(new Error('Synthetic request failure'));await t.render();
    expect(t.fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Could not load registrations');
    expect(t.vm.active).toBe(0);
    expect(t.fixture.nativeElement.querySelector('.strip')).toBeNull();
    (t.fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();await t.render();
    t.requests[3].next([actual]);await t.render();
    expect(t.vm.rows).toEqual([actual]);
  });
  it('clears editors and preview on branch change and cancels stale client/branch reads',async()=>{
    const t=await setup();
    t.requests[0].next([actual]);await t.render();
    t.vm.openEdit(actual);t.vm.viewDocument(test.documentUrl);await t.render();
    await t.select('#cr-selected-branch-id','branch-b');
    expect(t.vm.showForm).toBe(false);expect(t.vm.documentPreview).toBeNull();
    expect(t.list).toHaveBeenLastCalledWith('branch-b','client-a','ACTUAL');
    t.requests[0].next([test]);await t.render();expect(t.vm.rows).toEqual([]);
    t.params.next(convertToParamMap({clientId:'client-b'}));await t.render();
    t.requests[1].next([test]);await t.render();expect(t.vm.rows).toEqual([]);
    t.requests[2].next([actual]);await t.render();expect(t.vm.rows).toEqual([actual]);
    t.params.next(convertToParamMap({}));await t.render();
    expect(t.vm.rows).toEqual([]);expect(t.vm.selectedBranchId).toBe('');
  });
});
