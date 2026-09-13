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
