import { page as browserPage } from 'vitest/browser';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuditFollowUp, AuditFollowUpsComponent } from './audit-follow-ups.component';

const sample: AuditFollowUp = {
  id: '00000000-0000-4000-8000-000000000001', auditId: 'audit', auditCode: 'AUD-2026-0098',
  event: 'NC_ACCEPTED', status: 'FAILED', attempts: 8, retryCount: 0,
  lastError: 'Follow-up could not complete. Review server health before retrying.',
  createdAt: '2026-09-28T01:00:00Z', nextAttemptAt: '2026-09-28T02:00:00Z', completedAt: null,
};

describe('Administrator audit follow-up recovery', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AuditFollowUpsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });
  function mount(items = [sample], total = items.length) {
    const f = TestBed.createComponent(AuditFollowUpsComponent);
    f.detectChanges();
    http.expectOne((r) => r.method === 'GET').flush({ items, total });
    f.detectChanges();
    return f;
  }
  it('shows status, error, retry action and IST dates', () => {
    const f = mount();
    expect(f.nativeElement.textContent).toContain('Needs attention');
    expect(f.nativeElement.textContent).toContain('28 Sep 2026, 06:30');
    expect(f.nativeElement.textContent).toContain(sample.lastError);
    expect(f.nativeElement.querySelector('[title="Queue retry"]')).not.toBeNull();
  });
  it('queues one retry, blocks duplicate clicks, and refreshes the list', () => {
    const f = mount();
    f.nativeElement.querySelector('[title="Queue retry"]').click();
    f.detectChanges();
    expect(f.nativeElement.querySelector('[title="Queue retry"]').disabled).toBe(true);
    f.componentInstance.retry(sample);
    const req = http.expectOne((r) => r.method === 'POST');
    expect(req.request.url).toContain(sample.id + '/retry');
    req.flush({ status: 'PENDING' });
    http.expectOne((r) => r.method === 'GET').flush({ items: [{ ...sample, status: 'PENDING' }], total: 1 });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Retry queued.');
    expect(f.nativeElement.querySelector('[title="Queue retry"]')).toBeNull();
  });
  it.each(['SUCCEEDED', 'SKIPPED', 'PENDING'])('never retries %s jobs', (status) => {
    const f = mount([{ ...sample, status }]);
    expect(f.nativeElement.querySelector('[title="Queue retry"]')).toBeNull();
    f.componentInstance.retry({ ...sample, status });
    http.expectNone((r) => r.method === 'POST');
  });
  it('reports stale-state conflicts without claiming success', () => {
    const f = mount();
    f.componentInstance.retry(sample);
    http.expectOne((r) => r.method === 'POST').flush({}, { status: 409, statusText: 'Conflict' });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('The job has changed.');
    expect(f.componentInstance.message()).toBe('');
    expect(f.componentInstance.retrying()).toBe('');
  });
  it('cancels stale list requests when changing the filter', () => {
    const f = mount();
    f.componentInstance.changePage(0);
    const old = http.expectOne((r) => r.method === 'GET');
    f.componentInstance.status = 'RETRY';
    f.componentInstance.load(true);
    expect(old.cancelled).toBe(true);
    const req = http.expectOne((r) => r.method === 'GET');
    expect(req.request.params.get('status')).toBe('RETRY');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ items: [], total: 0 });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('No follow-ups match this status.');
  });
  it('paginates within the result bounds', () => {
    const f = mount([sample], 26);
    f.componentInstance.changePage(1);
    const req = http.expectOne((r) => r.method === 'GET');
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ items: [sample], total: 26 });
    f.componentInstance.changePage(1);
    http.expectNone((r) => r.method === 'GET');
  });
  it('clears stale rows when refresh fails', () => {
    const f = mount();
    f.componentInstance.load();
    http.expectOne((r) => r.method === 'GET').flush({}, { status: 503, statusText: 'Unavailable' });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Unable to load audit follow-ups');
    expect(f.nativeElement.textContent).not.toContain(sample.auditCode);
  });
  it('cancels requests on leaving the page', () => {
    const f = mount();
    f.componentInstance.load();
    const req = http.expectOne((r) => r.method === 'GET');
    f.destroy();
    expect(req.cancelled).toBe(true);
  });
  it('renders desktop and mobile with contained table scrolling', async () => {
    const f = mount([
      sample,
      { ...sample, id: '2', status: 'RETRY', attempts: 2, retryCount: 1, auditCode: 'AUD-2026-0099' },
      { ...sample, id: '3', status: 'SUCCEEDED', attempts: 1, lastError: null, auditCode: 'AUD-2026-0100' },
    ]);
    for (const [width, name] of [[1440, 'desktop'], [390, 'mobile']] as const) {
      await browserPage.viewport(width, 900);
      await f.whenStable();
      expect(f.nativeElement.querySelector('.follow-ups').scrollWidth).toBeLessThanOrEqual(width);
      const region = f.nativeElement.querySelector('.table-scroll');
      if (width < 600) expect(region.scrollWidth).toBeGreaterThan(region.clientWidth);
      expect(f.nativeElement.querySelector('.icon-button svg').getBoundingClientRect().width).toBeGreaterThanOrEqual(16);
      await browserPage.screenshot({ element: f.nativeElement, path: '../../../../../../docs/reviews/2026-09-28/audit-follow-ups-' + name + '.png' });
    }
  });
});
