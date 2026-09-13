import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RegisterLibraryComponent } from './register-library.component';

describe('Register library Act selection', () => {
  let component: RegisterLibraryComponent;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    component = TestBed.createComponent(RegisterLibraryComponent).componentInstance;
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { component.ngOnDestroy(); http.verify(); });
  it('keeps identically numbered forms under their selected Act', () => {
    component.forms = [
      { id: 'a', actCode: 'WAGES_2019', formNumber: 'V', title: 'Wage slip', source: { title: 'Wage rules' } },
      { id: 'b', actCode: 'OSH_2020', formNumber: 'V', title: 'Authority register', source: { title: 'OSH rules' } },
    ] as any;
    expect(component.visibleForms.length).toBe(0);
    component.actCode = 'WAGES_2019';
    component.query = 'V';
    expect(component.visibleForms.map(f => f.id)).toEqual(['a']);
  });
  it('cancels the previous jurisdiction and resets Act and prepared form selection', () => {
    component.load();
    const old = http.expectOne(r => r.params.get('jurisdiction') === 'AP');
    component.actCode = 'WAGES_2019';
    component.selectedForm = { id: 'old' } as any;
    component.jurisdiction = 'TS';
    component.load();
    expect(old.cancelled).toBe(true);
    expect(component.actCode).toBe('');
    expect(component.selectedForm).toBeNull();
    http.expectOne(r => r.params.get('jurisdiction') === 'TS').flush({ forms: [], jurisdiction: { code: 'TS' } });
    expect(component.info?.code).toBe('TS');
  });
});
