import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RegisterPreparationComponent } from './register-preparation.component';

describe('Register source selection and cancellation', () => {
  let component: RegisterPreparationComponent;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    component = TestBed.createComponent(RegisterPreparationComponent).componentInstance;
    http = TestBed.inject(HttpTestingController);
    component.branchId = 'branch';
    component.year = 2026;
    component.month = 9;
    component.formId = 'osh-employee';
  });
  afterEach(() => {
    component.ngOnDestroy();
    http.verify();
  });
  it('keeps client-as-contractor capacity separate from the vendor selector and resets site particulars', () => {
    component.ngOnChanges();
    http
      .expectOne((r) => r.url.endsWith('/definition'))
      .flush({
        form: { actCode: 'TS_SHOPS_1988' },
        layout: {
          fields: [{ key: 'name', label: 'Name', type: 'text', required: true }],
          baseFormNumber: 'STATE',
          manualOnly: true,
          capacityRequired: true,
          particulars: [
            { key: 'principalEmployer', label: 'Principal employer', type: 'text', required: true },
          ],
          particularsTitle: 'Form II',
        },
      });
    http.expectOne((r) => r.url.endsWith('/eligibility')).flush({ eligible: true });
    expect(component.supportsContractor).toBe(true);
    expect(component.canPrefill).toBe(false);
    expect(component.reuseAvailable).toBe(false);
    component.generate();
    expect(component.error).toContain('company capacity');
    http.expectNone((r) => r.url.endsWith('/generate'));
    component.actingCapacity = 'CONTRACTOR';
    component.particulars = { principalEmployer: 'Other Company — customer site' };
    component.generate();
    const request = http.expectOne((r) => r.url.endsWith('/generate'));
    expect(request.request.body.actingCapacity).toBe('CONTRACTOR');
    expect(request.request.body.contractorUserId).toBeUndefined();
    expect(request.request.body.particulars.principalEmployer).toContain('Other Company');
    component.branchId = 'another-branch';
    component.ngOnChanges();
    expect(request.cancelled).toBe(true);
    expect(component.particulars).toEqual({});
    expect(component.actingCapacity).toBe('');
    http
      .expectOne((r) => r.url.endsWith('/definition'))
      .flush({ layout: { fields: [], baseFormNumber: 'I' } });
    http.expectOne((r) => r.url.endsWith('/eligibility')).flush({ eligible: true });
    expect(component.capacityRequired).toBe(false);
  });
  it('uses the year-end period for an annual ledger and disables monthly prefills', () => {
    component.ngOnChanges();
    http
      .expectOne((r) => r.url.endsWith('/definition'))
      .flush({
        layout: {
          fields: [],
          baseFormNumber: 'LEAVE',
          periodKind: 'ANNUAL',
          manualOnly: true,
          payrollPrefill: false,
        },
      });
    http
      .expectOne((r) => r.url.endsWith('/eligibility') && r.params.get('month') === '12')
      .flush({ eligible: true });
    expect(component.annual).toBe(true);
    expect(component.periodMonth).toBe(12);
    expect(component.month).toBe(9);
    expect(component.canPrefill).toBe(false);
    component.formId = 'monthly';
    component.ngOnChanges();
    http
      .expectOne((r) => r.url.endsWith('/definition'))
      .flush({ layout: { fields: [], baseFormNumber: 'LEAVE', payrollPrefill: false } });
    http
      .expectOne((r) => r.url.endsWith('/eligibility') && r.params.get('month') === '9')
      .flush({ eligible: true });
    expect(component.annual).toBe(false);
  });
  it('keeps maternity details separate from payroll and contractor prefills', () => {
    component.ngOnChanges();
    http
      .expectOne((r) => r.url.endsWith('/definition'))
      .flush({ layout: { fields: [], baseFormNumber: 'MATERNITY', payrollPrefill: false } });
    http.expectOne((r) => r.url.endsWith('/eligibility')).flush({ eligible: true });
    expect(component.isMaternity).toBe(true);
    expect(component.canPrefill).toBe(false);
    expect(component.supportsContractor).toBe(false);
    expect(component.operational).toBe(false);
  });
  it('uses the employee source without requiring a payroll run', () => {
    component.ngOnChanges();
    http
      .expectOne((r) => r.url.endsWith('/definition'))
      .flush({ layout: { fields: [], baseFormNumber: 'I', payrollPrefill: false } });
    http.expectOne((r) => r.url.endsWith('/eligibility')).flush({ eligible: true });
    expect(component.requiresPayroll).toBe(false);
    expect(component.prefillLabel).toContain('employee records');
    component.prefill();
    http
      .expectOne((r) => r.url.endsWith('/prefill') && r.params.get('branchId') === 'branch')
      .flush({ rows: [{ employee_1: 'E1' }], notice: 'Approved profiles' });
    expect(component.rows).toEqual([{ employee_1: 'E1' }]);
  });
  it('cancels an old source request and clears its rows when the branch changes', () => {
    component.prefill();
    const old = http.expectOne((r) => r.url.endsWith('/prefill'));
    component.branchId = 'new-branch';
    component.ngOnChanges();
    expect(old.cancelled).toBe(true);
    expect(component.rows).toEqual([{}]);
    http
      .expectOne((r) => r.url.endsWith('/definition'))
      .flush({ layout: { fields: [], baseFormNumber: 'IX', payrollPrefill: false } });
    http.expectOne((r) => r.url.endsWith('/eligibility')).flush({ eligible: true });
    expect(component.prefillLabel).toContain('daily attendance');
  });
  it('cancels stale vendor data when the selected contractor changes', () => {
    component.recordSource = 'CONTRACTOR';
    component.changeSource();
    http
      .expectOne((r) => r.url.endsWith('/contractors') && r.params.get('branchId') === 'branch')
      .flush([
        { id: 'vendor1', name: 'Vendor One' },
        { id: 'vendor2', name: 'Vendor Two' },
      ]);
    component.contractorId = 'vendor1';
    component.prefill();
    const old = http.expectOne(
      (r) => r.url.endsWith('/prefill') && r.params.get('contractorId') === 'vendor1',
    );
    component.contractorId = 'vendor2';
    component.changeContractor();
    expect(old.cancelled).toBe(true);
    expect(component.rows).toEqual([{}]);
    component.prefill();
    http
      .expectOne((r) => r.url.endsWith('/prefill') && r.params.get('contractorId') === 'vendor2')
      .flush({ rows: [{ name: 'Vendor Two Worker' }], sourceReference: 'Published payroll two' });
    expect(component.rows).toEqual([{ name: 'Vendor Two Worker' }]);
    expect(component.meta['supportingReference']).toBe('Published payroll two');
  });
});

// State leave registers must not offer the Central-only statutory calculator.
describe('Register preparation capabilities', () => {
  it('uses verified definition capabilities for state reuse and leave calculations', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(RegisterPreparationComponent);
    const c = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    c.formId = 'bihar';
    c.branchId = 'branch';
    c.year = 2026;
    c.month = 9;
    c.ngOnChanges();
    http
      .expectOne((r) => r.url.endsWith('/definition'))
      .flush({
        layout: { fields: [], baseFormNumber: 'LEAVE', payrollPrefill: false },
        reuseRule: { basis: 'Bihar OSH Rules 2026, Rule 27(2)' },
        leaveCalculationAvailable: false,
      });
    http.expectOne((r) => r.url.endsWith('/eligibility')).flush({ eligible: true });
    expect(c.reuseAvailable).toBe(true);
    expect(c.reuseBasis).toContain('Bihar');
    expect(c.leaveCalculationAvailable).toBe(false);
    c.ngOnDestroy();
    http.verify();
  });
});
