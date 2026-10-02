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
  it('automatically loads a Telangana draft and preserves reviewed details on repeated loading', () => {
    component.runId = 'approved-run';
    component.ngOnChanges();
    http.expectOne(r => r.url.endsWith('/definition')).flush({ layout: {
      fields: [{ key: 'name', label: 'Name', required: true, type: 'text' }, { key: 'gross', label: 'Gross', required: true, type: 'money' }],
      particulars: [{ key: 'establishmentName', label: 'Establishment', required: true, type: 'text' }],
      baseFormNumber: 'STATE', manualOnly: true, payrollDraftPrefill: true,
    }});
    http.expectOne(r => r.url.endsWith('/eligibility')).flush({ eligible: true });
    const load = http.expectOne(r => r.url.endsWith('/prefill') && r.params.get('runId') === 'approved-run');
    component.meta['employer'] = 'Reviewed employer';
    load.flush({ rows: [{ name: 'Worker', gross: 0 }], metadata: { employer: 'Saved employer' }, particulars: { establishmentName: 'Saved branch' }, sourceReference: 'Approved payroll reference' });
    expect(component.rows[0]['gross']).toBe(0);
    expect(component.meta['employer']).toBe('Reviewed employer');
    expect(component.particulars['establishmentName']).toBe('Saved branch');
    expect(component.missingDetails).toContain('Owner name');
    expect(component.missingDetails.some(d => d.includes('Gross'))).toBe(false);
    component.rows[0]['name'] = 'Reviewed worker';
    component.prefill();
    http.expectNone(r => r.url.endsWith('/prefill'));
    component.generate();
    http.expectNone(r => r.url.endsWith('/generate'));
    expect(component.error).toContain('Owner name');
    for (const f of component.metadataFields) component.meta[f.key] ||= 'Reviewed evidence';
    component.generate();
    const saved = http.expectOne(r => r.url.endsWith('/generate'));
    expect(saved.request.body.rows[0].name).toBe('Reviewed worker');
    saved.flush(new Blob(['workbook']));
  });
  it('shows field errors returned as Nest validation message arrays', () => {
    component.eligible = true;
    component.prefill();
    http.expectOne(r => r.url.endsWith('/prefill')).flush({ message: ['Select a valid branch', 'Select a valid month'] }, { status: 400, statusText: 'Bad Request' });
    expect(component.error).toContain('Select a valid month');
  });
  it('prepares both factory integrated parts with explicit site capacity', () => {
    component.formId = 'ts--factories-1948--ts-integrated-2019--ii---iii--tsi';
    component.ngOnChanges();
    http.expectOne(r => r.url.endsWith('/definition')).flush({
      form: { actCode: 'FACTORIES_1948', sourceId: 'tsi' },
      layout: { fields: [], baseFormNumber: 'STATE', manualOnly: true, capacityRequired: true,
        particulars: [{ key: 'establishmentName', label: 'Name', type: 'text', required: true }] },
    });
    http.expectOne(r => r.url.endsWith('/eligibility')).flush({ eligible: true });
    expect(component.supportsContractor).toBe(true);
    expect(component.canPrefill).toBe(false);
    component.generate();
    http.expectNone(r => r.url.endsWith('/generate'));
    expect(component.error).toContain('company’s responsibility');
    component.actingCapacity = 'DIRECT_EMPLOYER';
    component.particulars = { establishmentName: 'Factory site' };
    component.rows = [{ name: 'Worker' }];
    component.generate();
    const request = http.expectOne(r => r.url.includes('ts--factories-1948') && r.url.endsWith('/generate'));
    expect(request.request.body.particulars.establishmentName).toBe('Factory site');
    expect(request.request.body.actingCapacity).toBe('DIRECT_EMPLOYER');
    request.flush(new Blob(['{"message":"Complete the register details"}'], { type: 'application/json' }), { status: 400, statusText: 'Bad Request' });
  });
  it('shows an ineligible result and prevents preparation requests', () => {
    component.ngOnChanges();
    http.expectOne((r) => r.url.endsWith('/definition'))
      .flush({ layout: { fields: [], baseFormNumber: 'I', payrollPrefill: true } });
    const reason = 'Confirm TS_SHOPS_1988 applicability before generating registers.';
    http.expectOne((r) => r.url.endsWith('/eligibility'))
      .flush({ eligible: false, reason });
    expect(component.eligible).toBe(false);
    expect(component.eligibilityReason).toBe(reason);
    component.notice = 'Blank format downloaded.';
    expect(component.eligibilityReason).toBe(reason);
    expect(component.error).toBe('');
    component.generate();
    component.prefill();
    http.expectNone((r) => /\/(generate|prefill)$/.test(r.url));
    component.ngOnChanges();
    expect(component.eligibilityReason).toBe('');
    http.expectOne((r) => r.url.endsWith('/definition'))
      .flush({ layout: { fields: [], baseFormNumber: 'I' } });
    http.expectOne((r) => r.url.endsWith('/eligibility')).flush({ eligible: true });
    expect(component.eligible).toBe(true);
    expect(component.eligibilityReason).toBe('');
  });

  it('keeps transport and access errors visible without enabling generation', () => {
    component.ngOnChanges();
    http.expectOne((r) => r.url.endsWith('/definition'))
      .flush({ layout: { fields: [], baseFormNumber: 'I' } });
    http.expectOne((r) => r.url.endsWith('/eligibility'))
      .flush({ message: 'Access denied' }, { status: 403, statusText: 'Forbidden' });
    expect(component.eligible).toBe(false);
    expect(component.error).toBe('Access denied');
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
    expect(component.error).toContain('company’s responsibility');
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
    const generated: unknown[] = [];
    component.generated.subscribe((scope) => generated.push(scope));
    component.generate();
    const saved = http.expectOne((r) => r.url.endsWith('/generate'));
    expect(saved.request.body.month).toBe(12);
    saved.flush(new Blob(['register']));
    expect(generated).toEqual([{ branchId: 'branch', year: 2026, month: 12 }]);
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
    component.eligible = true;
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
  it('automatically loads a selected contractor draft and cancels it when returning to company employees', () => {
    component.eligible = true;
    component.draftPrefill = true;
    component.runId = 'approved-company-run';
    component.recordSource = 'CONTRACTOR';
    component.changeSource();
    http.expectOne(r => r.url.endsWith('/contractors')).flush([{ id: 'vendor', name: 'Example vendor' }]);
    http.expectNone(r => r.url.endsWith('/prefill'));
    component.contractorId = 'vendor';
    component.changeContractor();
    const vendor = http.expectOne(r => r.url.endsWith('/prefill') && r.params.get('contractorId') === 'vendor');
    expect(component.workerSourceLabel).toBe('Example vendor');
    component.recordSource = 'EMPLOYEES';
    component.changeSource();
    expect(vendor.cancelled).toBe(true);
    http.expectOne(r => r.url.endsWith('/prefill') && r.params.get('contractorId') === '' && r.params.get('runId') === 'approved-company-run')
      .flush({ rows: [{ name: 'Company employee' }], metadata: { employer: 'Example company' } });
    expect(component.rows).toEqual([{ name: 'Company employee' }]);
    expect(component.draftLoaded).toBe(true);
    expect(component.contractorId).toBe('');
    expect(component.actingCapacity).toBe('');
  });
  it('cancels stale vendor data when the selected contractor changes', () => {
    component.eligible = true;
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
