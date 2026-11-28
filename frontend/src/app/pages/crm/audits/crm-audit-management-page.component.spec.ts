import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { page } from 'vitest/browser';
import { AuditsService } from '../../../core/audits.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { CrmAuditManagementPageComponent } from './crm-audit-management-page.component';

describe('CRM report holds', () => {
  const sampleAudit = { id: 'sample-audit', auditCode: 'QA-2026-09', status: 'IN_PROGRESS', client: { clientName: 'QA Sample Manufacturing' } } as any;
  function setup() {
    const api = {
      crmApproveReport: vi.fn(() => of({})),
      crmPublishReport: vi.fn(() => of({})),
      crmReleaseReportHold: vi.fn(() => of({})),
      crmGetReadiness: vi.fn(() => of({})),
      crmAuditActionRequests: vi.fn(() => of([])),
      crmGetReportStatus: vi.fn(() => of({ status: 'SUBMITTED', held: false })),
    };
    const toast = { success: vi.fn(), error: vi.fn() };
    const dialog = { prompt: vi.fn(async (_title: string, _message: string, _options: any) => ({confirmed:true,value:'  Evidence reviewed  '})) };
    const component = new CrmAuditManagementPageComponent(api as any, {} as any, {} as any, {} as any, toast as any, dialog as any, {} as any, { markForCheck: vi.fn() } as any);
    component.selectedAudit = sampleAudit;
    component.latestReportStatus = { status: 'SUBMITTED', held: true, holdRemarks: 'Awaiting evidence' };
    return { component, api, toast, dialog };
  }

  it('blocks approve and publish when server status is held', () => {
    const { component, api } = setup();
    component.approveReport(); component.publishReport();
    expect(api.crmApproveReport).not.toHaveBeenCalled();
    expect(api.crmPublishReport).not.toHaveBeenCalled();
  });
  it.each(['approve','publish'] as const)('sends %s remarks and reloads saved review history', async action => {
    const {component,api} = setup();
    component.latestReportStatus = {status:action==='approve'?'SUBMITTED':'APPROVED',held:false};
    const saved = {decision:action==='approve'?'APPROVED':'PUBLISHED',remarks:'Evidence reviewed',revision:'2',reviewedAt:'2026-11-28T05:00:00Z',reviewedBy:'Synthetic CRM'};
    api.crmGetReportStatus.mockReturnValue(of({status:saved.decision,held:false,reviewHistory:[saved]} as any));
    await (action==='approve'?component.approveReport():component.publishReport());
    expect(action==='approve'?api.crmApproveReport:api.crmPublishReport).toHaveBeenCalledWith('sample-audit','Evidence reviewed');
    expect(component.latestReportStatus?.reviewHistory).toEqual([saved]);
  });
  it('preserves failed remarks for retry without offering them on another audit', async () => {
    const {component,api,dialog}=setup();
    component.latestReportStatus={status:'SUBMITTED',held:false};
    api.crmApproveReport.mockReturnValue(throwError(()=>new Error('offline')));
    await component.approveReport();
    await component.approveReport();
    expect(dialog.prompt.mock.calls[1][2].defaultValue).toBe('Evidence reviewed');
    component.selectedAudit={...sampleAudit,id:'other-audit'};
    await component.approveReport();
    expect(dialog.prompt.mock.calls[2][2].defaultValue).toBe('');
  });
  it('does not approve a different selection after the remarks dialog opens', async () => {
    const {component,api,dialog}=setup();
    component.latestReportStatus={status:'SUBMITTED',held:false};
    let finish: (value:any)=>void = ()=>{};
    dialog.prompt.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));
    const pending=component.approveReport();
    component.selectedAudit={...sampleAudit,id:'other-audit'};
    finish({confirmed:true,value:'Notes for original audit'});
    await pending;
    expect(api.crmApproveReport).not.toHaveBeenCalled();
    expect(component.governanceBusy).toBe(false);
  });
  it('rejects overlong remarks and duplicate review clicks', async () => {
    const {component,api,dialog}=setup();
    component.latestReportStatus={status:'SUBMITTED',held:false};
    dialog.prompt.mockResolvedValue({confirmed:true,value:'x'.repeat(2001)});
    const first=component.approveReport();
    await component.approveReport(); await first;
    expect(dialog.prompt).toHaveBeenCalledTimes(1);
    expect(api.crmApproveReport).not.toHaveBeenCalled();
  });
  it('does not send a decision when the page closes during the remarks dialog', async () => {
    const {component,api,dialog}=setup();
    component.latestReportStatus={status:'SUBMITTED',held:false};
    let finish: (value:any)=>void = ()=>{};
    dialog.prompt.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));
    const pending=component.approveReport();
    component.ngOnDestroy();
    finish({confirmed:true,value:'Do not submit after leaving'});
    await pending;
    expect(api.crmApproveReport).not.toHaveBeenCalled();
  });

  it('releases hold and reloads status from the API', () => {
    const { component, api } = setup();
    component.releaseReportHold();
    expect(api.crmReleaseReportHold).toHaveBeenCalledWith('sample-audit');
    expect(api.crmGetReportStatus).toHaveBeenCalledWith('sample-audit');
    expect(component.latestReportStatus?.held).toBe(false);
    expect(component.governanceBusy).toBe(false);
  });

  it('keeps the held state when release fails', () => {
    const { component, api, toast } = setup();
    api.crmReleaseReportHold.mockReturnValue(throwError(() => ({ error: { message: 'Not assigned' } })));
    component.releaseReportHold();
    expect(component.latestReportStatus?.held).toBe(true);
    expect(component.governanceBusy).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Not assigned');
  });

  it('does not submit duplicate releases while waiting', () => {
    const { component, api } = setup();
    const pending = new Subject<any>(); api.crmReleaseReportHold.mockReturnValue(pending);
    component.releaseReportHold(); component.releaseReportHold();
    expect(api.crmReleaseReportHold).toHaveBeenCalledTimes(1);
    pending.next({}); pending.complete(); component.ngOnDestroy();
  });

  it.each([390, 768, 1440])('renders held reports and wrapped notes at %s pixels', async width => {
    await page.viewport(width, 1000);
    const { api, toast } = setup();
    await TestBed.configureTestingModule({
      imports: [CrmAuditManagementPageComponent, HttpClientTestingModule, RouterTestingModule],
      providers: [{ provide: AuditsService, useValue: api }, { provide: ToastService, useValue: toast }],
    }).compileComponents();
    const fixture = TestBed.createComponent(CrmAuditManagementPageComponent);
    const component = fixture.componentInstance;
    vi.spyOn(component as any, 'loadInitialData').mockImplementation(() => {});
    component.loading = false;
    component.selectedAudit = sampleAudit;
    component.audits = [sampleAudit];
    component.filteredAudits = [sampleAudit];
    component.latestReportStatus = { stage: 'FINAL', status: 'SUBMITTED', held: true, holdRemarks: 'Awaiting signed evidence. '+ 'Sample-reference-'.repeat(35),
      reviewHistory:[{decision:'APPROVED',remarks:'Verified evidence. '+'LongReference'.repeat(80),revision:'1',reviewedBy:'Synthetic reviewer',reviewedAt:'2026-11-28T05:00:00Z'}]};
    fixture.detectChanges(); await fixture.whenStable();
    const section = fixture.nativeElement.querySelector('[aria-label="Report status"]') as HTMLElement;
    const findButton = (text: string) => Array.from(section.querySelectorAll('button')).find(b => (b.getAttribute('aria-label') || b.textContent)?.trim().endsWith(text));
    expect(section.textContent).toContain('On hold');
    expect(findButton('Approve')?.disabled).toBe(true);
    expect(findButton('Release Hold')?.disabled).toBe(false);
    expect((findButton('Hold')?.getAttribute('aria-label') || findButton('Hold')?.textContent)?.trim()).toBe('Release Hold');
    const notes = section.querySelector('[role="status"] p') as HTMLElement;
    expect(notes.scrollWidth).toBeLessThanOrEqual(notes.clientWidth + 1);
    expect(section.getBoundingClientRect().width).toBeLessThanOrEqual(width);
    const history=section.querySelector('[data-testid="report-review-history"]') as HTMLElement;
    expect(history.textContent).toContain('Approval remarks');
    expect(history.textContent).toContain('Synthetic reviewer');
    expect(history.scrollWidth).toBeLessThanOrEqual(history.clientWidth+1);
    section.scrollIntoView({ block: 'center' });
    await page.screenshot({ path: `__screenshots__/audit-report-held-${width}.png` });
    findButton('Release Hold')!.click();
    fixture.detectChanges(); await fixture.whenStable();
    expect(section.textContent).not.toContain('On hold');
    expect(findButton('Approve')?.disabled).toBe(false);
    api.crmGetReportStatus.mockReturnValue(of({ status: 'DRAFT', held: false }));
    (component as any).loadAuditInsights('sample-audit');
    fixture.detectChanges(); await fixture.whenStable();
    expect(findButton('Hold')).toBeUndefined();
    fixture.destroy(); TestBed.resetTestingModule();
  });
});

describe('CRM schedule actions', () => {
  function setup(status = 'PLANNED') {
    const api = { crmUpdateStatus: vi.fn(() => of({})), crmDeleteSchedule: vi.fn(() => of({})) };
    const dialog = { prompt: vi.fn(async () => ({ confirmed: true, value: 'TEST ONLY schedule correction' })) };
    const toast = { success: vi.fn(), error: vi.fn() };
    const component = new CrmAuditManagementPageComponent(api as any, {} as any, {} as any, {} as any, toast as any, dialog as any, {} as any, {markForCheck: vi.fn()} as any);
    const audit = {id:'test', auditCode:'TEST-2099', status, clientId:'test-client', periodCode:'2099-11', client:{clientName:'Test client'}} as any;
    component.selectedAudit = audit;
    vi.spyOn(component, 'refreshWorkspace').mockImplementation(() => {});
    return { component, api, dialog, toast, audit };
  }
  it('passes the reason when cancelling active audits and refreshes their status', async () => {
    const t = setup('IN_PROGRESS'); await t.component.changeStatus(t.audit, 'CANCELLED');
    expect(t.api.crmUpdateStatus).toHaveBeenCalledWith('test', 'CANCELLED', 'TEST ONLY schedule correction');
    expect(t.component.refreshWorkspace).toHaveBeenCalledWith('test');
  });
  it('does not mutate after dismissing the prompt or entering a blank reason', async () => {
    const t = setup(); t.dialog.prompt.mockResolvedValue({confirmed:false,value:''});
    await t.component.changeStatus(t.audit,'CANCELLED');
    t.dialog.prompt.mockResolvedValue({confirmed:true,value:' '});
    await t.component.deleteSchedule(t.audit);
    expect(t.api.crmUpdateStatus).not.toHaveBeenCalled(); expect(t.api.crmDeleteSchedule).not.toHaveBeenCalled();
  });
  it('blocks cancellation for a published report and deletion after work starts', async () => {
    const t = setup('IN_PROGRESS'); t.audit.reportStatus = 'PUBLISHED';
    await t.component.changeStatus(t.audit,'CANCELLED'); await t.component.deleteSchedule(t.audit);
    expect(t.dialog.prompt).not.toHaveBeenCalled();
  });
  it('retains the schedule while deletion awaits CCO approval', async () => {
    const t = setup(); t.api.crmDeleteSchedule.mockReturnValueOnce(throwError(() => ({error:{message:'Evidence exists'}})));
    await t.component.deleteSchedule(t.audit);
    expect(t.component.selectedAudit).toBe(t.audit); expect(t.toast.error).toHaveBeenCalledWith('Evidence exists');
    await t.component.deleteSchedule(t.audit);
    expect(t.component.selectedAudit).toBe(t.audit); expect(t.component.refreshWorkspace).toHaveBeenCalledWith('test');
    expect(t.toast.success).toHaveBeenCalledWith('Deletion request sent to CCO; schedule unchanged');
  });
  it('preserves contractor, due date and notes when editing an assignment', async () => {
    const t = setup();
    vi.spyOn(t.component as any,'loadBranchesForClient').mockImplementation(() => {});
    vi.spyOn(t.component as any,'loadContractorsForClient').mockImplementation(() => {});
    Object.assign(t.audit,{contractorUserId:'vendor',dueDate:'2099-11-15',notes:'Keep this note'});
    await t.component.openScheduleModal(t.audit);
    expect(t.component.scheduleModel).toMatchObject({contractorUserId:'vendor',dueDate:'2099-11-15',notes:'Keep this note'});
  });
});
