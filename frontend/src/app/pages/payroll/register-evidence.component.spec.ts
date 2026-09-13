import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RegisterEvidenceComponent } from './register-evidence.component';

describe('Register evidence scope', () => {
  let component: RegisterEvidenceComponent;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    component = TestBed.createComponent(RegisterEvidenceComponent).componentInstance;
    http = TestBed.inject(HttpTestingController);
    component.formId = 'employee';
    component.branchId = 'branch';
    component.year = 2026;
    component.month = 9;
  });
  afterEach(() => {
    component.ngOnDestroy();
    http.verify();
  });
  it('cancels old reuse candidates and clears approval state on vendor change', () => {
    component.contractorId = 'vendor-one';
    component.load();
    const old = http.expectOne(
      (r) => r.url.endsWith('/reuse') && r.params.get('contractorId') === 'vendor-one',
    );
    component.canApprove = true;
    component.sourceId = 'old-source';
    component.contractorId = 'vendor-two';
    component.ngOnChanges({ contractorId: new SimpleChange('vendor-one', 'vendor-two', false) });
    expect(old.cancelled).toBe(true);
    expect(component.canApprove).toBe(false);
    expect(component.sourceId).toBe('');
    component.load();
    http
      .expectOne((r) => r.url.endsWith('/reuse') && r.params.get('contractorId') === 'vendor-two')
      .flush({ candidates: [], links: [], canApprove: false });
  });
  it('saves the selected branch and period even if metadata contains stale scope', () => {
    component.operational = true;
    component.draftMetadata = { branchId: 'stale', supportingReference: 'Incident report' };
    component.draftRows = [{ incidentDate: '2026-09-01' }];
    component.saveSource();
    const save = http.expectOne((r) => r.method === 'POST');
    expect(save.request.body.branchId).toBe('branch');
    expect(save.request.body.year).toBe(2026);
    save.flush({ id: 'source' });
    http.expectOne((r) => r.method === 'GET').flush({ records: [], canApprove: false });
  });
});
