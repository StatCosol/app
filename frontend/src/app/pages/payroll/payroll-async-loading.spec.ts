import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { vi } from 'vitest';
import { PayrollReportsComponent } from './payroll-reports.component';
import { PayrollQueriesComponent } from './payroll-queries.component';
import { PayrollApiService } from './payroll-api.service';
import { ToastService } from '../../shared/toast/toast.service';

describe('Payroll async rendering', () => {
  afterEach(() => TestBed.resetTestingModule());
  function reports() {
    const clients = new Subject<any[]>();
    TestBed.configureTestingModule({ imports: [PayrollReportsComponent], providers: [
      provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: PayrollApiService, useValue: { getAssignedClients: () => clients } },
      { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
    ] });
    const fixture=TestBed.createComponent(PayrollReportsComponent); fixture.detectChanges();
    return { fixture, clients };
  }
  it('renders assigned report clients on a delayed first response', async () => {
    const {fixture,clients}=reports(); await fixture.whenStable();
    clients.next([{id:'company',name:'Assigned company'}]); clients.complete();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#pr-selected-client-id').textContent).toContain('Assigned company');
  });
  it('clears the report download busy state when the response fails', async () => {
    const {fixture,clients}=reports(); clients.next([]); clients.complete(); await fixture.whenStable();
    const button=fixture.nativeElement.querySelector('ui-button button') as HTMLButtonElement;
    button.click(); await fixture.whenStable(); expect(button.disabled).toBe(true);
    const report=fixture.componentInstance.reports[0];
    TestBed.inject(HttpTestingController).expectOne(r=>r.url===report.endpoint).flush(null,{status:503,statusText:'Unavailable'});
    await fixture.whenStable(); expect(button.disabled).toBe(false);
  });
  it('updates the ticket context when route parameters change asynchronously', async () => {
    const params=new BehaviorSubject(convertToParamMap({clientId:'first'}));
    TestBed.configureTestingModule({ imports:[PayrollQueriesComponent],providers:[
      provideZonelessChangeDetection(), provideHttpClient(),
      {provide:ActivatedRoute,useValue:{paramMap:params,parent:null}},
    ] }).overrideComponent(PayrollQueriesComponent,{set:{imports:[],template:'@for (id of contextIds; track id) { <p class="context">{{ id }}</p> }'}});
    const fixture=TestBed.createComponent(PayrollQueriesComponent); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('first');
    params.next(convertToParamMap({clientId:'second'})); await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('second');
    expect(fixture.nativeElement.textContent).not.toContain('first');
  });
});
