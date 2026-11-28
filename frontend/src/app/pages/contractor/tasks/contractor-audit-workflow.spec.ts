import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ContractorTasksComponent } from './contractor-tasks.component';
import { ContractorProfileApiService } from '../../../core/contractor-profile-api.service';
import { ContractorUnifiedTaskCenterPageComponent } from './contractor-unified-task-center-page.component';
import { CONTRACTOR_ROUTES } from '../contractor.routes';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { page } from '@vitest/browser/context';
import { ComplianceService } from '../../../core/compliance.service';
import { AuditsService } from '../../../core/audits.service';
import { ToastService } from '../../../shared/toast/toast.service';

describe('Contractor assigned audit documents', () => {
  const audit = (id = 'audit') => ({
    id,
    auditCode: id,
    notes: 'TEST ONLY fixture',
    branchId: 'branch',
    contractorUserId: 'vendor',
    contractorUser: { name: 'Test vendor' },
    branch: { branchName: 'Test branch' },
    periodCode: '2026-10',
    auditType: 'CONTRACTOR',
    status: 'PLANNED',
  });
  function setup(path = 'audit-documents') {
    const api: any = {
      getContractorTasks: vi.fn(() => of([])),
      contractorGetReuploadRequests: vi.fn(() => of([])),
    };
    const audits: any = {
      contractorListAudits: vi.fn(() => of([])),
      contractorListNonCompliances: vi.fn(() => of([])),
      contractorGetUploadLock: vi.fn(() => of({})),
    };
    const profile: any = {
      getContractorBranches: vi.fn(() => of({ branches: [{ id: 'branch', name: 'Test branch' }] })),
      getMonthlyDocChecklist: vi.fn(() => of({ items: [] })),
      getContractorDocuments: vi.fn(() => of([])),
      uploadAuditDocument: vi.fn(() => of({ id: 'document' })),
    };
    const route: any = {
      queryParamMap: new BehaviorSubject(convertToParamMap({})),
      paramMap: new BehaviorSubject(convertToParamMap({})),
      snapshot: { queryParamMap: convertToParamMap({}), routeConfig: { path } },
    };
    const c = new ContractorTasksComponent(
      api,
      audits,
      profile,
      route,
      { markForCheck: vi.fn() } as any,
      { success: vi.fn(), error: vi.fn() } as any,
    );
    return { c, api, audits, profile };
  }
  it('routes Audit Documents to the contractor workboard, not the factory master', async () => {
    const route = CONTRACTOR_ROUTES[0].children!.find((r) => r.path === 'audit-documents')!;
    expect(await (route.loadComponent as any)()).toBe(ContractorUnifiedTaskCenterPageComponent);
    const wrapper = new ContractorUnifiedTaskCenterPageComponent();
    expect(wrapper.canLeave()).toBe(true);
    wrapper.tasks = { auditDocUploading: true } as any;
    expect(wrapper.canLeave()).toBe(false);
  });
  it('opens the assigned audit filter with Actual scope by default', () => {
    const t = setup();
    t.c.ngOnInit();
    expect(t.c.typeFilter).toBe('AUDIT');
    expect(t.audits.contractorListAudits).toHaveBeenCalledWith({ recordScope: 'ACTUAL' });
    t.c.ngOnDestroy();
  });
  it('clears actual rows and counts while switching to Test, without loading actual tasks', () => {
    const t = setup();
    t.c.ngOnInit();
    t.api.getContractorTasks.mockClear();
    t.c.allRows = [t.c['mapAuditRow'](audit('actual'))];
    const pending = new Subject<any>();
    t.audits.contractorListAudits.mockReturnValue(pending);
    t.c.changeAuditScope('TEST');
    expect(t.c.allRows).toEqual([]);
    expect(t.c.selectedRow).toBeNull();
    expect(t.api.getContractorTasks).not.toHaveBeenCalled();
    expect(t.audits.contractorListAudits).toHaveBeenLastCalledWith({ recordScope: 'TEST' });
    pending.next([audit('test')]);
    pending.complete();
    expect(t.c.filteredRows.map((r) => r.id)).toEqual(['test']);
    t.c.ngOnDestroy();
  });
  it('does not restore actual rows when a Test list fails', () => {
    const t = setup();
    t.c.ngOnInit();
    t.c.allRows = [t.c['mapAuditRow'](audit('actual'))];
    t.audits.contractorListAudits.mockReturnValue(throwError(() => new Error('Test outage')));
    t.c.changeAuditScope('TEST');
    expect(t.c.allRows).toEqual([]);
    expect(t.c.loadErrors).toEqual(['Audits']);
    t.c.ngOnDestroy();
  });
  it('ignores late audit documents, findings and lock reads after switching selection', () => {
    const t = setup();
    const docs = new Subject<any>();
    const ncs = new Subject<any>();
    const lock = new Subject<any>();
    t.profile.getContractorDocuments.mockReturnValueOnce(docs);
    t.audits.contractorListNonCompliances.mockReturnValueOnce(ncs);
    t.audits.contractorGetUploadLock.mockReturnValueOnce(lock);
    t.c.selectRow(t.c['mapAuditRow'](audit('old')));
    t.c.selectRow(t.c['mapAuditRow'](audit('new')));
    docs.next([{ id: 'old-doc' }]);
    ncs.next([{ id: 'old-nc', auditId: 'old' }]);
    lock.next({ lockFrom: '2000-01-01', lockUntil: '2099-12-31' });
    expect(t.c.auditUploadedDocs).toEqual([]);
    expect(t.c.auditNonCompliances).toEqual([]);
    expect(t.c.auditUploadLockFrom).toBeNull();
    t.c.ngOnDestroy();
  });
  it('locks context during upload and submits the selected audit month with a test marker', () => {
    const t = setup();
    t.c.auditRecordScope = 'TEST';
    t.c.selectRow(t.c['mapAuditRow'](audit('test')));
    const pending = new Subject<any>();
    t.profile.uploadAuditDocument.mockReturnValue(pending);
    t.c.auditDocFile = new File(['TEST ONLY'], 'fixture.pdf');
    t.c.auditDocType = 'CLRA_LICENSE';
    t.c.auditDocTitle = 'Synthetic licence';
    t.c.uploadAuditDocument();
    t.c.selectRow(t.c['mapAuditRow'](audit('other')));
    t.c.changeAuditScope('ACTUAL');
    t.c.uploadAuditDocument();
    expect(t.profile.uploadAuditDocument).toHaveBeenCalledTimes(1);
    expect(t.profile.uploadAuditDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        auditId: 'test',
        month: '2026-10',
        title: 'TEST ONLY Synthetic licence',
      }),
    );
    expect(t.c.selectedRow?.id).toBe('test');
    expect(t.c.auditRecordScope).toBe('TEST');
    pending.next({});
    pending.complete();
    expect(t.c.auditDocFile).toBeNull();
    t.c.ngOnDestroy();
  });
  it('clears old findings immediately while the next audit is loading', () => {
    const t = setup();
    t.c.selectRow(t.c['mapAuditRow'](audit('old')));
    t.c.auditNonCompliances = [{ id: 'old-nc', auditId: 'old' } as any];
    t.audits.contractorListNonCompliances.mockReturnValue(new Subject());
    t.c.selectRow(t.c['mapAuditRow'](audit('new')));
    expect(t.c.auditNonCompliances).toEqual([]);
    t.c.ngOnDestroy();
  });
  it('does not refresh another audit after a correction completes in an invalidated context', () => {
    const t = setup();
    const pending = new Subject();
    t.audits.contractorUploadCorrectedFile = vi.fn(() => pending);
    t.c.selectRow(t.c['mapAuditRow'](audit('old')));
    t.c.auditNcFiles['nc'] = new File(['TEST ONLY'], 'test.pdf');
    t.c.uploadAuditNcFile('nc');
    t.c.selectRow(t.c['mapAuditRow'](audit('new')));
    expect(t.c.selectedRow?.id).toBe('old');
    // A programmatic filter change may invalidate selection despite disabled UI controls.
    t.c.selectedRow = null;
    expect(() => pending.next({})).not.toThrow();
    pending.complete();
    expect(t.audits.contractorListAudits).not.toHaveBeenCalled();
    t.c.ngOnDestroy();
  });
  it('sends the audit month through the upload boundary', () => {
    const post = vi.fn(() => of({}));
    const api = new ContractorProfileApiService({ post } as any);
    api.uploadAuditDocument({
      auditId: 'test',
      branchId: 'branch',
      docType: 'CLRA_LICENSE',
      title: 'TEST ONLY fixture',
      month: '2026-10',
      file: new File(['TEST ONLY'], 'test.pdf'),
    });
    const form = (post.mock.calls as any)[0][1] as FormData;
    expect(form.get('month')).toBe('2026-10');
    expect(form.get('auditId')).toBe('test');
  });
  it.each(['branchId', 'contractorUserId'])('does not infer missing %s from a sole vendor branch', key => {
    const t = setup();
    t.c.availableBranches = [{ id: 'branch', name: 'Test branch' }];
    t.c.selectRow(t.c['mapAuditRow']({ ...audit(), [key]: null }));
    expect(t.c.auditUploadScopeError).toContain('CRM must assign');
    t.c.auditDocFile = new File(['TEST ONLY'], 'test.pdf');
    t.c.auditDocType = 'CLRA_LICENSE';
    t.c.auditDocTitle = 'TEST ONLY fixture';
    t.c.uploadAuditDocument();
    expect(t.profile.uploadAuditDocument).not.toHaveBeenCalled();
    t.c.ngOnDestroy();
  });
  it('keeps the assigned branch and normalizes the legacy month before uploading', () => {
    const t = setup();
    t.c.selectRow(t.c['mapAuditRow']({ ...audit(), periodCode: '2026-9' }));
    expect(t.c.selectedRow?.contractorName).toBe('Test vendor');
    expect(t.c.selectedRow?.branchName).toBe('Test branch');
    t.c.auditDocBranchId = 'other-branch';
    t.c.auditDocFile = new File(['TEST ONLY'], 'test.pdf');
    t.c.auditDocType = 'CLRA_LICENSE';
    t.c.auditDocTitle = 'TEST ONLY fixture';
    t.c.uploadAuditDocument();
    expect(t.profile.uploadAuditDocument).toHaveBeenCalledWith(expect.objectContaining({
      branchId: 'branch', month: '2026-09', auditId: 'audit',
    }));
    t.c.ngOnDestroy();
  });
  it.each([390, 768, 1440])('renders an explicit upload destination and an incomplete-scope warning at %ipx', async width => {
    await page.viewport(width, 900);
    const t = setup();
    t.audits.contractorListAudits.mockReturnValue(of([{
      ...audit(), client: { clientName: 'Test client' },
      branch: { branchName: 'Test branch with a long descriptive location' },
    }]));
    await TestBed.configureTestingModule({
      imports: [ContractorTasksComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: {
          queryParamMap: new BehaviorSubject(convertToParamMap({})),
          paramMap: new BehaviorSubject(convertToParamMap({})),
          snapshot: { queryParamMap: convertToParamMap({}), routeConfig: { path: 'audit-documents' } },
        }},
        { provide: ComplianceService, useValue: t.api },
        { provide: AuditsService, useValue: t.audits },
        { provide: ContractorProfileApiService, useValue: t.profile },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ContractorTasksComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const c = fixture.componentInstance;
    c.selectRow(c.allRows[0]);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Monthly statutory uploads are under Tasks');
    expect(host.querySelector('.audit-destination')?.textContent).toContain('Test vendor');
    expect(host.querySelector('.wizard-form')?.textContent).toContain('Upload destination');
    expect(host.querySelector('[name="auditDocBranch"]')).toBeNull();
    expect(host.querySelector('.wizard-form')?.textContent).toContain('2026-10');
    const destination = host.querySelector('.audit-destination') as HTMLElement;
    expect(destination.scrollWidth).toBeLessThanOrEqual(destination.clientWidth + 1);
    c.selectRow(c['mapAuditRow']({ ...audit('legacy'), branchId: null, contractorUserId: null }));
    fixture.detectChanges();
    expect(host.querySelector('[role="status"]')?.textContent).toContain('CRM must assign');
    expect(host.querySelector('.action-card--wizard')).toBeNull();
    fixture.destroy();
    TestBed.resetTestingModule();
    t.c.ngOnDestroy();
  });
});
