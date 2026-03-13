import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PayrollRunsComponent } from './payroll-runs.component';

describe('PayrollRunsComponent', () => {
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, PayrollRunsComponent],
    });
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('should create', () => {
    const fixture = TestBed.createComponent(PayrollRunsComponent);
    expect(fixture.componentInstance).toBeTruthy();
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
});
