import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RegisterLeaveCalculatorComponent } from './register-leave-calculator.component';

describe('Statutory leave calculation review', () => {
  let component: RegisterLeaveCalculatorComponent;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    component = TestBed.createComponent(RegisterLeaveCalculatorComponent).componentInstance;
    http = TestBed.inject(HttpTestingController);
    component.formId = 'leave';
    component.branchId = 'branch';
    component.year = 2026;
    component.month = 9;
    component.rows = [
      { name: 'Worker One', remarks: 'Existing payment evidence' },
      { name: 'Worker Two' },
    ];
    component.ngOnChanges();
  });
  afterEach(() => {
    component.ngOnDestroy();
    http.verify();
  });
  it('cancels calculation and discards its result when annual inputs change', () => {
    component.calculate();
    const old = http.expectOne((r) => r.url.endsWith('/leave-calculation'));
    component.ledger['workedDays'] = 200;
    component.invalidate();
    expect(old.cancelled).toBe(true);
    expect(component.result).toBeNull();
    expect(component.busy).toBe(false);
  });
  it('never applies a previous worker calculation to another worker', () => {
    component.calculate();
    const old = http.expectOne((r) => r.url.endsWith('/leave-calculation'));
    component.workerIndex = 1;
    component.reset();
    expect(old.cancelled).toBe(true);
    expect(component.ledger['workedDays']).toBeUndefined();
    expect(component.result).toBeNull();
  });
  it('preserves existing remarks and captures the inputs used for the result', () => {
    component.ledger['workedDays'] = 180;
    component.calculate();
    http
      .expectOne((r) => r.url.endsWith('/leave-calculation'))
      .flush({
        carryForward: 9,
        minimumEarnedFraction: '180/20',
        awardedDays: 9,
        carryOrdinary: 9,
        carryRefused: 0,
        encashableExcess: 0,
      });
    let output: any;
    component.calculated.subscribe((rows) => (output = rows));
    component.apply();
    expect(output[0].carryForward).toBe(9);
    expect(output[0].remarks).toContain('Existing payment evidence');
    expect(output[0].remarks).toContain('"workedDays":180');
    expect(component.rows[0]['carryForward']).toBeUndefined();
  });
});
