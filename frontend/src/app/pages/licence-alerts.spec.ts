import { page } from 'vitest/browser';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import {
  LicenceAlertsComponent,
  LicenceWarnings,
} from '../shared/licence-alerts/licence-alerts.component';

describe('Licence warnings on client and branch dashboards', () => {
  let fixture: ComponentFixture<LicenceAlertsComponent>;
  let http: HttpTestingController;
  const url = (request: any) => request.url.endsWith('/client/licence-alerts');
  const data: LicenceWarnings = {
    date: '2026-10-11',
    renewals: [
      {
        registrationId: 'renewal',
        branchName: 'Factory A',
        type: 'Factory License',
        registrationNumber: 'FL-1',
        renewalDueDate: '2026-11-10',
        expiryDate: '2026-12-10',
        daysToRenewal: 30,
        status: 'UPCOMING',
      },
    ],
    manpower: [
      {
        registrationId: 'factory',
        branchName: 'Factory A',
        registrationNumber: 'FL-1',
        licensedWorkerLimit: 100,
        onRoll: 70,
        contractor: 30,
        total: 100,
        excess: 0,
        status: 'AT_LIMIT',
      },
    ],
  };
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LicenceAlertsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(LicenceAlertsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('branchId', 'branch-a');
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify({ ignoreCancelled: true });
  });
  it('shows separate renew-by and expiry dates alongside combined headcount', () => {
    const request = http.expectOne(url);
    expect(request.request.params.get('branchId')).toBe('branch-a');
    request.flush(data);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('70 on-roll + 30 contractor');
    expect(text).toContain('At the licensed limit');
    expect(text).toContain('Renew by 10 Nov 2026');
    expect(text).toContain('Expires 10 Dec 2026');
    expect(text).not.toContain('Exceeds the licence limit');
  });
  it('shows the excess when 101 people punch against a limit of 100', () => {
    http
      .expectOne(url)
      .flush({
        ...data,
        manpower: [
          { ...data.manpower[0], contractor: 31, total: 101, excess: 1, status: 'BREACHED' },
        ],
      });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Exceeds the licence limit by 1 worker');
    expect(fixture.nativeElement.querySelector('article.breached')).toBeTruthy();
  });
  it('cancels an old branch request and clears stale warnings on a branch change', () => {
    const previous = http.expectOne(url);
    fixture.componentRef.setInput('branchId', 'branch-b');
    fixture.detectChanges();
    expect(previous.cancelled).toBe(true);
    expect(fixture.componentInstance.data).toBeNull();
    const current = http.expectOne(url);
    expect(current.request.params.get('branchId')).toBe('branch-b');
    current.flush({ date: data.date, renewals: [], manpower: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Factory A');
  });
  it('reports unavailable warnings instead of a false all-clear', () => {
    http.expectOne(url).flush({}, { status: 500, statusText: 'Failure' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Warnings could not be loaded');
    expect(fixture.nativeElement.textContent).not.toContain('No renewal warnings');
  });
  it('makes a missing licence limit visible', () => {
    http
      .expectOne(url)
      .flush({
        ...data,
        manpower: [{ ...data.manpower[0], licensedWorkerLimit: null, status: 'UNCONFIGURED' }],
      });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Ask your CRM to record the licensed worker limit',
    );
  });
  it('cancels outstanding requests when the dashboard is destroyed', () => {
    const request = http.expectOne(url);
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });
  it.each([1365, 390])('keeps deployment and renewal cards readable at %s pixels', async width => {
    await page.viewport(width, 1000);
    http.expectOne(url).flush({...data,manpower:[{...data.manpower[0],contractor:31,total:101,excess:1,status:'BREACHED'}]});
    fixture.detectChanges();await fixture.whenStable();
    const panel = fixture.nativeElement.querySelector('.licence-panel') as HTMLElement;
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width + 1);
    expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
    await page.screenshot({element:fixture.nativeElement,path:'../../../../docs/reviews/2026-10-11/licence-warnings-'+width+'.png'});
  });
});
