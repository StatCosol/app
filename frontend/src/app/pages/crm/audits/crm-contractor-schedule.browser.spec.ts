import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { page } from 'vitest/browser';
import { AuditsService } from '../../../core/audits.service';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';
import { CrmComplianceTrackerApi } from '../../../core/api/crm-compliance-tracker.api';
import { errorInterceptor } from '../../../core/interceptors/error.interceptor';
import { ToastService } from '../../../shared/toast/toast.service';
import { CrmAuditManagementPageComponent } from './crm-audit-management-page.component';

afterEach(()=>{TestBed.inject(HttpTestingController).verify();TestBed.resetTestingModule();});
async function setup(){
  const toast={error:vi.fn(),success:vi.fn(),warning:vi.fn()};
  await TestBed.configureTestingModule({imports:[CrmAuditManagementPageComponent],providers:[
    provideRouter([]),provideHttpClient(withInterceptors([errorInterceptor])),provideHttpClientTesting(),AuditsService,
    {provide:CrmClientsApi,useValue:{}},{provide:CrmComplianceTrackerApi,useValue:{}},{provide:ToastService,useValue:toast},
  ]}).compileComponents();
  const fixture=TestBed.createComponent(CrmAuditManagementPageComponent),vm=fixture.componentInstance;
  vi.spyOn(vm as any,'loadInitialData').mockImplementation(()=>{});
  vi.spyOn(vm,'refreshWorkspace').mockImplementation(()=>{});
  vm.loading=false;vm.showScheduleModal=true;
  vm.clients=[{id:'client',clientName:'Synthetic company'}] as any;
  vm.branchesByClient={client:[{id:'branch-a',branchName:'Synthetic unit A'},{id:'branch-b',branchName:'Synthetic unit B'}] as any};
  vm.contractorsByClient={client:[{id:'vendor',name:'Synthetic contractor',email:'synthetic@example.invalid'}]};
  vm.auditors=[{id:'auditor',name:'Synthetic reviewer'}];
  vm.scheduleModel={clientId:'client',branchId:'',contractorUserId:'',auditType:'CONTRACTOR',assignedAuditorId:'auditor',frequency:'MONTHLY',periodYear:2099,periodCode:'2099-12',dueDate:'2099-12-31',notes:'TEST ONLY isolated schedule'};
  const render=async()=>{(vm as any).cdr.markForCheck();fixture.detectChanges();await Promise.resolve();(vm as any).cdr.markForCheck();fixture.detectChanges();};
  await render();
  const root=fixture.nativeElement as HTMLElement;
  const change=async(id:string,value:string)=>{const select=root.querySelector('#'+id) as HTMLSelectElement;select.value=value;select.dispatchEvent(new Event('change'));await render();};
  const button=()=>root.querySelector('.modal-actions ui-button[variant="primary"] button') as HTMLButtonElement;
  return {fixture,vm,root,render,change,button,http:TestBed.inject(HttpTestingController),toast};
}
describe.each([390,768,1440])('Contractor scheduling at %ipx',width=>{
  beforeEach(async()=>page.viewport(width,950));
  it('requires a branch and contractor before posting and retains the draft on one inline error',async()=>{
    const t=await setup();
    expect(t.root.querySelector('label[for="camp-branch-id"]')?.textContent).toContain('*');
    expect(t.root.querySelector('label[for="camp-contractor-user-id"]')?.textContent).toBe('Contractor *');
    expect(t.root.querySelector('#camp-branch-id')?.textContent).not.toContain('All branches');
    expect(t.root.querySelector('#camp-contractor-user-id')?.textContent).not.toContain('All contractors');
    expect(t.root.textContent).toContain('separate audit for each branch-contractor pair');
    expect(t.button().disabled).toBe(true);
    t.vm.saveSchedule();t.http.expectNone(r=>r.method==='POST');await t.render();
    expect(t.root.querySelectorAll('.modal-body [role="alert"]').length).toBe(1);
    await t.change('camp-branch-id','branch-a');expect(t.button().disabled).toBe(true);
    await t.change('camp-contractor-user-id','vendor');expect(t.button().disabled).toBe(false);
    t.button().click();await t.render();expect(t.button().disabled).toBe(true);
    t.vm.saveSchedule();
    const request=t.http.expectOne(r=>r.method==='POST'&&r.url.endsWith('/crm/audits'));
    expect(request.request.body).toMatchObject({branchId:'branch-a',contractorUserId:'vendor',auditType:'CONTRACTOR'});
    request.flush({message:'Synthetic assignment changed; choose another reviewer.'},{status:400,statusText:'Bad Request'});
    await t.render();
    expect(t.toast.error).not.toHaveBeenCalled();
    expect(t.root.querySelectorAll('.modal-body [role="alert"]').length).toBe(1);
    expect(t.root.textContent).toContain('Synthetic assignment changed');
    expect(t.vm.scheduleModel.notes).toBe('TEST ONLY isolated schedule');expect(t.vm.showScheduleModal).toBe(true);
    expect(t.vm.scheduleModel.contractorUserId).toBe('vendor');
    const panel=t.root.querySelector('.modal-panel')!.getBoundingClientRect();
    expect(panel.left).toBeGreaterThanOrEqual(0);expect(panel.right).toBeLessThanOrEqual(width+1);
    t.button().click();t.http.expectOne(r=>r.method==='POST').flush({id:'synthetic-audit',auditCode:'TEST ONLY'});
    await t.render();expect(t.vm.showScheduleModal).toBe(false);
  });
});
it('clears a previous contractor on branch changes and keeps non-contractor all-branch scheduling available',async()=>{
  const t=await setup();
  await t.change('camp-branch-id','branch-a');await t.change('camp-contractor-user-id','vendor');
  await t.change('camp-branch-id','branch-b');expect(t.vm.scheduleModel.contractorUserId).toBe('');expect(t.button().disabled).toBe(true);
  await t.change('camp-audit-type','SAFETY');await t.change('camp-branch-id','');
  expect(t.root.querySelector('#camp-branch-id')?.textContent).toContain('All branches');
  expect(t.root.querySelector('label[for="camp-contractor-user-id"]')?.textContent).toContain('Optional');
  expect(t.button().disabled).toBe(false);t.button().click();
  const request=t.http.expectOne(r=>r.method==='POST');expect(request.request.body.branchId).toBeUndefined();expect(request.request.body.contractorUserId).toBeUndefined();request.flush({id:'synthetic-safety'});
});
it('does not make legacy scope fields editable or block assignment-only updates',async()=>{
  const t=await setup();t.vm.scheduleMode='ASSIGN';t.vm.scheduleAuditId='legacy';await t.render();
  expect(t.vm.contractorScheduleScopeIncomplete).toBe(false);
  expect((t.root.querySelector('#camp-branch-id') as HTMLSelectElement).disabled).toBe(true);
  expect((t.root.querySelector('#camp-contractor-user-id') as HTMLSelectElement).disabled).toBe(true);
  expect(t.button().disabled).toBe(false);
});

describe.each([390,768,1440])('Client-wide assignment at %ipx',width=>{
  beforeEach(async()=>page.viewport(width,950));
  const coverage={previewToken:'reviewed-token',branchCount:2,createCount:2,existingCount:0,canAssign:true,blocking:[],uncoveredBranches:[],items:[
    {branchId:'branch-a',branchName:'Synthetic unit A',contractorUserId:'vendor',contractorName:'Synthetic contractor',action:'CREATE'},
    {branchId:'branch-b',branchName:'Synthetic unit B',contractorUserId:'vendor',contractorName:'Synthetic contractor',action:'CREATE'},
  ]};
  it('previews exact coverage before confirming one auditor for every pair',async()=>{
    const t=await setup();t.vm.clientWideSchedule=true;t.vm.onAssignmentScopeChange();await t.render();
    expect(t.root.querySelector('#camp-branch-id')).toBeNull();expect(t.button().textContent).toContain('Preview coverage');
    t.button().click();await t.render();expect(t.button().disabled).toBe(true);
    const preview=t.http.expectOne(r=>r.url.endsWith('/client-assignment/preview'));
    expect(preview.request.body.assignedAuditorId).toBe('auditor');expect(preview.request.body.branchId).toBeUndefined();
    preview.flush(coverage);await t.render();
    expect(t.root.textContent).toContain('Synthetic unit A');expect(t.root.textContent).toContain('Synthetic unit B');
    expect(t.button().textContent).toContain('Confirm client assignment');
    t.vm.scheduleModel.dueDate='2100-01-01';await t.render();
    expect(t.vm.currentAssignmentPreview).toBeNull();expect(t.button().textContent).toContain('Preview coverage');
    t.button().click();t.http.expectOne(r=>r.url.endsWith('/preview')).flush({...coverage,previewToken:'new-date-token'});await t.render();
    t.button().click();await t.render();t.vm.saveSchedule();
    const save=t.http.expectOne(r=>r.url.endsWith('/client-assignment'));
    expect(save.request.body.previewToken).toBe('new-date-token');expect(save.request.body.dueDate).toBe('2100-01-01');
    save.flush({created:[{id:'test-a'},{id:'test-b'}],existingCount:0});await t.render();
    expect(t.vm.showScheduleModal).toBe(false);expect(t.toast.success).toHaveBeenCalledWith(expect.stringContaining('2 audits created'));
  });
  it('shows conflicts and unmapped branches, blocks confirmation, and recovers without losing the draft',async()=>{
    const t=await setup();t.vm.clientWideSchedule=true;await t.render();t.button().click();
    t.http.expectOne(r=>r.url.endsWith('/preview')).flush({...coverage,canAssign:false,uncoveredBranches:[{id:'empty',name:'Unmapped unit'}],items:[{...coverage.items[0],action:'CONFLICT'}]});await t.render();
    expect(t.button().disabled).toBe(true);expect(t.root.textContent).toContain('assigned to another auditor');expect(t.root.textContent).toContain('Unmapped unit');
    t.vm.scheduleModel.notes+=' retry';await t.render();t.button().click();
    t.http.expectOne(r=>r.url.endsWith('/preview')).flush(coverage);await t.render();t.button().click();
    t.http.expectOne(r=>r.url.endsWith('/client-assignment')).flush({message:'Coverage changed. Preview again.'},{status:409,statusText:'Conflict'});await t.render();
    expect(t.toast.error).not.toHaveBeenCalled();expect(t.vm.currentAssignmentPreview).toBeNull();expect(t.vm.scheduleModel.notes).toContain('retry');
    expect(t.root.querySelectorAll('.modal-body [role="alert"]').length).toBe(1);
    const panel=t.root.querySelector('.modal-panel')!.getBoundingClientRect();expect(panel.left).toBeGreaterThanOrEqual(0);expect(panel.right).toBeLessThanOrEqual(width+1);
  });
});
