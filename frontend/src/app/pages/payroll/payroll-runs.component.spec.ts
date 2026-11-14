import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { PayrollRunsComponent } from './payroll-runs.component';

describe('PayrollRunsComponent', () => {
  let controller: HttpTestingController;

  const fakeRoute = {
    snapshot: { paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}) },
    params: of({}),
    paramMap: of(convertToParamMap({})),
    queryParamMap: of(convertToParamMap({})),
  };

  beforeEach(() => {
    fakeRoute.snapshot.queryParamMap = convertToParamMap({});
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, PayrollRunsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: fakeRoute },
      ],
    });
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    try { controller.verify(); } finally { TestBed.resetTestingModule(); }
  });

function processedFixture() {
    const fixture = TestBed.createComponent(PayrollRunsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    controller.expectOne('/api/v1/payroll/clients').flush([]);
    controller.expectOne('/api/v1/payroll/runs').flush([]);
    const run = { id: 'test-run', status: 'PROCESSED', employeeCount: 1, periodMonth: 12, periodYear: 2025 };
    component.runs = [run];
    component.filteredRuns = [{ ...run }];
    component.selectedRun = { ...run };
    (component as any).workspaceRunId = run.id;
    (component as any).leaveValidationRunId = run.id;
    (component as any).otValidationRunId = run.id;
    component.startEditEmployee({ empCode: 'TEST-E001', daysPresent: 20 } as any);
    vi.spyOn((component as any).dialog, 'confirm').mockResolvedValue(true);
    return { fixture, component };
  }

  function flushInputRefresh(status = 'DRAFT') {
    controller.expectOne('/api/v1/payroll/runs/test-run/employees').flush([{ empCode: 'TEST-E001', netPay: 1200 }]);
    controller.expectOne('/api/v1/payroll/runs/test-run/approval-status').flush({ status });
  }

  it('offers Process after editing an employee and Submit only after full processing', async () => {
    const { fixture, component } = processedFixture();
    const success = vi.spyOn((component as any).toast, 'success');
    component.startEditEmployee({ empCode: 'TEST-E001', daysPresent: 20 } as any);
    component.saveEmployeeEdit({ empCode: 'TEST-E001' } as any);
    controller.expectOne('/api/v1/payroll/runs/test-run/employees/TEST-E001/edit-inputs').flush({});
    expect(component.selectedRun?.status).toBe('DRAFT');
    expect(component.actionGuardReason(component.selectedRun!, 'SUBMIT')).toBeTruthy();
    flushInputRefresh();
    expect(component.runs[0].status).toBe('DRAFT');
    expect(component.filteredRuns[0].status).toBe('DRAFT');
    expect(success).toHaveBeenCalledWith('TEST-E001 inputs saved. Process the full run before submitting.');
    fixture.detectChanges();
    const processButton = fixture.nativeElement.querySelector('ui-button[title="Process payroll run"] button') as HTMLButtonElement;
    expect(processButton).toBeTruthy();
    expect(processButton.disabled).toBe(false);
    expect(component.actionGuardReason(component.selectedRun!, 'SUBMIT')).toBeTruthy();

    await component.processRun(component.selectedRun!);
    controller.expectOne('/api/v1/payroll/runs/test-run/process').flush({ status: 'PROCESSED', processed: 1 });
    controller.expectOne('/api/v1/payroll/runs').flush([{ ...component.selectedRun, status: 'PROCESSED' }]);
    flushInputRefresh('PROCESSED');
    expect(component.actionGuardReason(component.selectedRun!, 'SUBMIT')).toBeNull();
  });

  it.each(['import', 'leave', 'ot', 'bulk-leave', 'bulk-ot', 'add', 'add-file'])(
    'refreshes status and enables full processing after %s input changes', async kind => {
      const { component } = processedFixture();
      component.leaveValidationRows = [{ empCode: 'TEST-E001', status: 'MISMATCH', essApprovedLeave: 1 }] as any;
      component.otValidationRows = [{ empCode: 'TEST-E001', status: 'MISMATCH', maxDiff: 1 }] as any;
      let pending: Promise<void> | undefined;
      if (kind === 'import') {
        component.importFile = new File(['synthetic'], 'TEST-attendance.csv');
        component.uploadRunImport();
      } else if (kind === 'leave') component.resolveLeaveValidationRow('TEST-E001');
      else if (kind === 'ot') component.resolveOtValidationRow('TEST-E001');
      else if (kind === 'bulk-leave') pending = component.resolveAllLeaveValidation();
      else if (kind === 'bulk-ot') pending = component.resolveAllOtValidation();
      else if (kind === 'add') {
        component.addEmpSelected.add('TEST-E001');
        await component.confirmAddEmployees();
      } else {
        component.addEmpParsedCodes = ['TEST-E001'];
        await component.uploadAddEmpFile();
      }
      controller.expectOne(request => request.method === 'POST').flush({ otHours: 2, source: 'ESS', added: ['TEST-E001'] });
      if (pending) await pending;
      expect(component.selectedRun?.status).toBe('DRAFT');
      flushInputRefresh();
      expect(component.actionGuardReason(component.selectedRun!, 'PROCESS')).toBeNull();
      expect(component.actionGuardReason(component.selectedRun!, 'SUBMIT')).toBeTruthy();
    },
  );

  it('refreshes state after input recalculation fails and stays safe if status lookup fails', () => {
    const { component } = processedFixture();
    component.saveEmployeeEdit({ empCode: 'TEST-E001' } as any);
    controller.expectOne('/api/v1/payroll/runs/test-run/employees/TEST-E001/edit-inputs')
      .flush({ message: 'Synthetic calculation failure' }, { status: 500, statusText: 'Error' });
    controller.expectOne('/api/v1/payroll/runs/test-run/employees').flush([]);
    controller.expectOne('/api/v1/payroll/runs/test-run/approval-status')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(component.selectedRun?.status).toBe('DRAFT');
    expect(component.actionGuardReason(component.selectedRun!, 'SUBMIT')).toBeTruthy();
  });

  it('ignores pre-edit status and employee responses arriving after the refreshed Draft', () => {
    const { component } = processedFixture();
    (component as any).loadRunWorkspaceData('test-run', false);
    const oldEmployees = controller.expectOne('/api/v1/payroll/runs/test-run/employees');
    const oldStatus = controller.expectOne('/api/v1/payroll/runs/test-run/approval-status');
    component.saveEmployeeEdit({ empCode: 'TEST-E001' } as any);
    controller.expectOne('/api/v1/payroll/runs/test-run/employees/TEST-E001/edit-inputs').flush({});
    flushInputRefresh();
    oldStatus.flush({ status: 'PROCESSED' });
    oldEmployees.flush([{ empCode: 'STALE', netPay: 9999 }]);
    expect(component.selectedRun?.status).toBe('DRAFT');
    expect(component.runEmployees[0].empCode).toBe('TEST-E001');
    expect(component.runEmployees[0].netPay).toBe(1200);
    expect(component.actionGuardReason(component.selectedRun!, 'SUBMIT')).toBeTruthy();
  });

  it('keeps another selected run and its editor intact when a pending add completes', async () => {
    const { component } = processedFixture();
    component.addEmpSelected.add('TEST-E001');
    await component.confirmAddEmployees();
    const request = controller.expectOne('/api/v1/payroll/runs/test-run/add-employees');
    component.selectedRun = { id: 'other-run', status: 'PROCESSED', employeeCount: 1 } as any;
    component.showAddEmployeePanel = true;
    component.addEmpSearch = 'new search';
    component.addEmpSelected = new Set(['OTHER-E001']);
    component.runEmployees = [{ empCode: 'OTHER-E001' }] as any;
    request.flush({ added: ['TEST-E001'] });
    controller.expectOne('/api/v1/payroll/runs/test-run/approval-status').flush({ status: 'DRAFT' });
    controller.expectNone('/api/v1/payroll/runs/other-run/employees');
    expect(component.selectedRun?.status).toBe('PROCESSED');
    expect(component.runEmployees[0].empCode).toBe('OTHER-E001');
    expect(component.showAddEmployeePanel).toBe(true);
    expect(component.addEmpSearch).toBe('new search');
    expect([...component.addEmpSelected]).toEqual(['OTHER-E001']);
    expect(component.runs[0].status).toBe('DRAFT');
  });

  it('ignores old-run employee data after switching to a different run', () => {
    const { component } = processedFixture();
    (component as any).loadRunWorkspaceData('test-run', false);
    const oldEmployees = controller.expectOne('/api/v1/payroll/runs/test-run/employees');
    const oldStatus = controller.expectOne('/api/v1/payroll/runs/test-run/approval-status');
    component.selectedRun = { id: 'other-run', status: 'APPROVED' } as any;
    (component as any).loadRunWorkspaceData('other-run', false);
    controller.expectOne('/api/v1/payroll/runs/other-run/employees').flush([{ empCode: 'OTHER-E001' }]);
    controller.expectOne('/api/v1/payroll/runs/other-run/approval-status').flush({ status: 'APPROVED' });
    oldEmployees.flush([{ empCode: 'STALE' }]);
    oldStatus.flush({ status: 'DRAFT' });
    expect(component.runEmployees[0].empCode).toBe('OTHER-E001');
    expect(component.selectedRun?.status).toBe('APPROVED');
  });

it('prevents a prior-month editor from writing the same employee in another run', () => {
    const { component } = processedFixture();
    component.editEmpForm.payableDays = 7;
    component.selectRun({ id: 'february', status: 'PROCESSED', periodMonth: 2, periodYear: 2026 } as any);
    controller.expectOne('/api/v1/payroll/runs/february/employees').flush([{ empCode: 'TEST-E001', daysPresent: 24 }]);
    controller.expectOne('/api/v1/payroll/runs/february/approval-status').flush({ status: 'PROCESSED' });
    expect(component.editingEmpCode).toBeNull();
    component.saveEmployeeEdit({ empCode: 'TEST-E001' } as any);
    controller.expectNone(request => request.method === 'POST');
    component.startEditEmployee(component.runEmployees[0]);
    expect(component.editEmpForm.payableDays).toBe(24);
  });

  it.each(['leave', 'ot'])('ignores delayed %s validations from the previous payroll month', kind => {
    const { component } = processedFixture();
    if (kind === 'leave') component.loadLeaveValidation(); else component.loadOtValidation();
    const old = controller.expectOne('/api/v1/payroll/runs/test-run/' + kind + '-validation');
    component.selectRun({ id: 'february', status: 'PROCESSED', periodMonth: 2, periodYear: 2026 } as any);
    controller.expectOne('/api/v1/payroll/runs/february/employees').flush([{ empCode: 'TEST-E001' }]);
    controller.expectOne('/api/v1/payroll/runs/february/approval-status').flush({ status: 'PROCESSED' });
    old.flush({ rows: [{ empCode: 'TEST-E001', status: 'MISMATCH' }] });
    expect(component.leaveValidationRows).toEqual([]);
    expect(component.otValidationRows).toEqual([]);
    component.resolveLeaveValidationRow('TEST-E001');
    component.resolveOtValidationRow('TEST-E001');
    controller.expectNone(request => request.method === 'POST');
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(PayrollRunsComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it.each(['SUBMITTED', 'APPROVED', 'LOCKED', 'FINALIZED', 'UNKNOWN'])(
    'blocks rerun and input edits while status is %s', async (status) => {
      const component = TestBed.createComponent(PayrollRunsComponent).componentInstance;
      const run = { id: 'locked', status, employeeCount: 1 } as any;
      component.selectedRun = run;
      expect(component.canChangePayrollInputs()).toBe(false);
      expect(component.actionGuardReason(run, 'RERUN')).toBeTruthy();
      expect(component.actionGuardReason(run, 'IMPORT')).toBeTruthy();
      component.startEditEmployee({ empCode: 'E001' } as any);
      component.saveEmployeeEdit({ empCode: 'E001' } as any);
      component.resolveLeaveValidationRow('E001');
      component.resolveOtValidationRow('E001');
      await component.resolveAllLeaveValidation();
      await component.resolveAllOtValidation();
      component.toggleAddEmployeePanel();
      await component.confirmAddEmployees();
      await component.uploadAddEmpFile();
      expect(component.editingEmpCode).toBeNull();
      expect(component.showAddEmployeePanel).toBe(false);
      controller.expectNone(request => request.method !== 'GET');
    },
  );

  it.each(['DRAFT', 'PROCESSED', 'REJECTED', 'IN_PROGRESS'])('keeps %s inputs editable', status => {
    const component = TestBed.createComponent(PayrollRunsComponent).componentInstance;
    component.selectedRun = { id: 'editable', status, employeeCount: 1 } as any;
    expect(component.canChangePayrollInputs()).toBe(true);
    expect(component.actionGuardReason(component.selectedRun!, 'IMPORT')).toBeNull();
  });

  it('reruns a processed payroll and reports calculation errors instead of success', async () => {
    const component = TestBed.createComponent(PayrollRunsComponent).componentInstance;
    const run = { id: '1', status: 'PROCESSED', employeeCount: 28 } as any;
    component.selectedRun = run;
    const dialog = (component as any).dialog;
    const toast = (component as any).toast;
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true);
    const error = vi.spyOn(toast, 'error');
    const success = vi.spyOn(toast, 'success');
    vi.spyOn(component, 'loadRuns').mockImplementation(() => undefined);

    await component.rerunRun(run);
    const request = controller.expectOne('/api/v1/payroll/runs/1/process');
    request.flush({ processed: 0, status: 'DRAFT', errors: ['No active salary structure'] });
    expect(error).toHaveBeenCalledWith('No active salary structure');
    expect(success).not.toHaveBeenCalled();
  });

  it('should load runs on init', () => {
    const fixture = TestBed.createComponent(PayrollRunsComponent);
    fixture.detectChanges();

    const clientsReq = controller.expectOne('/api/v1/payroll/clients');
    expect(clientsReq.request.method).toBe('GET');
    clientsReq.flush([]);

    const runsReq = controller.expectOne('/api/v1/payroll/runs');
    expect(runsReq.request.method).toBe('GET');
    runsReq.flush([
      { id: '1', periodMonth: 1, periodYear: 2025, status: 'APPROVED', createdAt: '2025-01-15' },
    ]);

    const employeesReq = controller.expectOne('/api/v1/payroll/runs/1/employees');
    expect(employeesReq.request.method).toBe('GET');
    employeesReq.flush([]);

    const approvalReq = controller.expectOne('/api/v1/payroll/runs/1/approval-status');
    expect(approvalReq.request.method).toBe('GET');
    approvalReq.flush({});

    fixture.detectChanges();
    expect(fixture.componentInstance.runs.length).toBe(1);
    expect(fixture.componentInstance.filteredRuns.length).toBe(1);
    expect(fixture.componentInstance.selectedRun?.id).toBe('1');
    expect(fixture.componentInstance.loadingRuns).toBe(false);
  });

  it('should convert month number to name', () => {
    const fixture = TestBed.createComponent(PayrollRunsComponent);
    expect(fixture.componentInstance.monthLabel(1)).toBe('January');
    expect(fixture.componentInstance.monthLabel(6)).toBe('June');
    expect(fixture.componentInstance.monthLabel(12)).toBe('December');
  });

  it('should return correct status class', () => {
    const fixture = TestBed.createComponent(PayrollRunsComponent);
    expect(fixture.componentInstance.statusClass('APPROVED')).toBe('status-pill status-pill--ok');
    expect(fixture.componentInstance.statusClass('PROCESSED')).toBe('status-pill status-pill--info');
    expect(fixture.componentInstance.statusClass('REJECTED')).toBe('status-pill status-pill--bad');
    expect(fixture.componentInstance.statusClass('DRAFT')).toBe('status-pill');
  });

  it('should clear list when runs load fails', () => {
    const fixture = TestBed.createComponent(PayrollRunsComponent);
    fixture.detectChanges();

    const clientsReq = controller.expectOne('/api/v1/payroll/clients');
    clientsReq.flush([]);

    const runsReq = controller.expectOne('/api/v1/payroll/runs');
    runsReq.error(new ProgressEvent('error'));

    fixture.detectChanges();
    expect(fixture.componentInstance.runs.length).toBe(0);
    expect(fixture.componentInstance.filteredRuns.length).toBe(0);
    expect(fixture.componentInstance.selectedRun).toBeNull();
    expect(fixture.componentInstance.loadingRuns).toBe(false);
  });
  it('selects the requested run instead of the first listed run', () => {
    fakeRoute.snapshot.queryParamMap = convertToParamMap({ runId: '2' });
    const fixture = TestBed.createComponent(PayrollRunsComponent);
    fixture.detectChanges();
    controller.expectOne('/api/v1/payroll/clients').flush([]);
    controller.expectOne('/api/v1/payroll/runs').flush([
      { id: '1', periodMonth: 8, periodYear: 2026, status: 'DRAFT' },
      { id: '2', periodMonth: 8, periodYear: 2026, status: 'DRAFT' },
    ]);
    controller.expectOne('/api/v1/payroll/runs/2/employees').flush([]);
    controller.expectOne('/api/v1/payroll/runs/2/approval-status').flush({});
    expect(fixture.componentInstance.selectedRun?.id).toBe('2');
  });
});
