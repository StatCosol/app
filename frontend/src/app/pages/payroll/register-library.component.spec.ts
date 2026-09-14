import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RegisterLibraryComponent } from './register-library.component';

describe('Register library Act selection', () => {
  let component: RegisterLibraryComponent;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    component = TestBed.createComponent(RegisterLibraryComponent).componentInstance;
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    component.ngOnDestroy();
    http.verify();
  });
  it('keeps identically numbered forms under their selected Act', () => {
    component.forms = [
      {
        id: 'a',
        actCode: 'WAGES_2019',
        formNumber: 'V',
        title: 'Wage slip',
        source: { title: 'Wage rules' },
      },
      {
        id: 'b',
        actCode: 'OSH_2020',
        formNumber: 'V',
        title: 'Authority register',
        source: { title: 'OSH rules' },
      },
    ] as any;
    expect(component.visibleForms.length).toBe(0);
    component.actCode = 'WAGES_2019';
    expect(component.visibleForms).toEqual([]);
    component.submitAct();
    component.query = 'V';
    expect(component.visibleForms.map((f) => f.id)).toEqual(['a']);
  });
  it('switches Shops and Contract Labour only after submission and clears the prior prepared form', () => {
    component.forms = [
      {
        id: 'shops',
        actCode: 'TS_SHOPS_1988',
        formNumber: 'II + III',
        title: 'Integrated Shops register',
        source: { title: 'Telangana integrated order' },
      },
      {
        id: 'contract',
        actCode: 'CLRA_1970',
        formNumber: 'XIII',
        title: 'Contractor employee register',
        source: { title: 'Contract Labour Rules' },
      },
      {
        id: 'multi',
        actCode: 'MULTI_ACT',
        formNumber: 'II + III',
        title: 'Multi-Act reference',
        source: { title: 'Integrated order' },
      },
    ] as any;
    component.actCode = 'TS_SHOPS_1988';
    component.submitAct();
    expect(component.visibleForms.map((f) => f.id)).toEqual(['shops']);
    component.selectedForm = component.forms[0];
    component.query = 'integrated';
    component.actCode = 'CLRA_1970';
    component.changeAct();
    expect(component.selectedForm).toBeNull();
    expect(component.visibleForms).toEqual([]);
    expect(component.query).toBe('');
    component.submitAct();
    expect(component.visibleForms.map((f) => f.id)).toEqual(['contract']);
    expect(component.acts.find((a) => a.code === 'TS_SHOPS_1988')?.name).toContain(
      'Shops and Establishments',
    );
  });
  it('loads formats from the saved branch state and cancels the previous branch', () => {
    component.branchId = 'branch-a';
    component.loadBranch();
    const old = http.expectOne(
      (r) => r.url.endsWith('/branch-context') && r.params.get('branchId') === 'branch-a',
    );
    component.actCode = 'WAGES_2019';
    component.selectedForm = { id: 'old' } as any;
    component.branchId = 'branch-b';
    component.loadBranch();
    expect(old.cancelled).toBe(true);
    expect(component.actCode).toBe('');
    expect(component.selectedForm).toBeNull();
    http
      .expectOne((r) => r.url.endsWith('/branch-context'))
      .flush({
        branchId: 'branch-b',
        branchName: 'Hyderabad',
        stateCode: 'TS',
        centralRulesAvailable: false,
      });
    expect(component.jurisdiction).toBe('TS');
    expect(component.availableJurisdictions.map((j) => j.code)).toEqual(['TS']);
    http
      .expectOne((r) => r.params.get('jurisdiction') === 'TS')
      .flush({ forms: [], jurisdiction: { code: 'TS' } });
    expect(component.info?.code).toBe('TS');
    component.jurisdiction = 'KA';
    component.load();
    http.expectNone((r) => r.params.get('jurisdiction') === 'KA');
    expect(component.error).toContain('valid state code');
  });
  it('clears a pending catalogue and employee editor when the branch is cleared', () => {
    component.branchId = 'branch-a';
    component.loadBranch();
    http
      .expectOne((r) => r.url.endsWith('/branch-context'))
      .flush({
        branchId: 'branch-a',
        branchName: 'Bengaluru',
        stateCode: 'KA',
        centralRulesAvailable: false,
      });
    const catalogue = http.expectOne((r) => r.params.get('jurisdiction') === 'KA');
    component.selectedForm = { id: 'old' } as any;
    component.branchId = '';
    component.loadBranch();
    expect(catalogue.cancelled).toBe(true);
    expect(component.selectedForm).toBeNull();
    expect(component.forms).toEqual([]);
    expect(component.jurisdiction).toBe('');
    expect(component.availableJurisdictions).toEqual([]);
  });
  it('does not fall back to AP or Central when branch state is missing', () => {
    component.branchId = 'branch-a';
    component.loadBranch();
    http
      .expectOne((r) => r.url.endsWith('/branch-context'))
      .flush(
        { message: 'Set a recognised state code' },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(component.jurisdiction).toBe('');
    expect(component.error).toContain('state code');
    http.expectNone((r) => r.params.has('jurisdiction'));
  });
  it('offers Central rules only when the branch facts confirm that jurisdiction', () => {
    component.branchId = 'branch-a';
    component.loadBranch();
    http
      .expectOne((r) => r.url.endsWith('/branch-context'))
      .flush({
        branchId: 'branch-a',
        branchName: 'Hyderabad',
        stateCode: 'TS',
        centralRulesAvailable: true,
      });
    http
      .expectOne((r) => r.params.get('jurisdiction') === 'TS')
      .flush({ forms: [], jurisdiction: { code: 'TS' } });
    expect(component.availableJurisdictions.map((j) => j.code)).toEqual(['TS', 'CENTRAL']);
    component.jurisdiction = 'CENTRAL';
    component.load();
    http
      .expectOne((r) => r.params.get('jurisdiction') === 'CENTRAL')
      .flush({ forms: [], jurisdiction: { code: 'CENTRAL' } });
  });
});
