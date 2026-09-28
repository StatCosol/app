import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { BranchReportsComponent } from './branch-reports.component';
import { AuthService } from '../../../core/auth.service';
import { ReportsService } from '../../../core/reports.service';

async function setup() {
  await TestBed.configureTestingModule({
    imports: [BranchReportsComponent],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: {
        hasModule: () => true, getUser: () => ({ clientId: 'sample-company' }),
      } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(BranchReportsComponent);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController) };
}

afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

it.each([390, 1440])('renders and downloads a scoped PDF at %ipx', async (width) => {
  await page.viewport(width, 1000);
  const { fixture, http } = await setup();
  const host: HTMLElement = fixture.nativeElement;
  const button = host.querySelector<HTMLButtonElement>('.pdf-download-button')!;
  fixture.componentInstance.pdfMonth = '2026-09';
  fixture.detectChanges();
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-pdf');
  button.click();
  fixture.detectChanges();
  expect(button.disabled).toBe(true);
  const request = http.expectOne(r => r.url.endsWith('/reports/pdf/compliance/sample-company'));
  expect(request.request.params.get('month')).toBe('2026-09');
  expect(request.request.responseType).toBe('blob');
  request.flush(new Blob(['%PDF-1.4 sample'], { type: 'application/pdf' }));
  fixture.detectChanges();
  expect(createUrl).toHaveBeenCalled();
  expect(click).toHaveBeenCalledTimes(1);
  expect(button.disabled).toBe(false);
  for (const control of host.querySelectorAll('input, select, .pdf-download-button')) {
    const bounds = control.getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(width + 1);
    expect(bounds.height).toBeGreaterThan(0);
  }
  expect(host.scrollWidth).toBeLessThanOrEqual(width);
  await page.screenshot({ element: host, path: `../../../../.vitest-attachments/branch-reports-${width}.png` });
  http.verify();
});

it('renders a permission error without downloading an error blob', async () => {
  const { fixture, http } = await setup();
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  fixture.componentInstance.downloadPdf();
  http.expectOne(r => r.url.endsWith('/reports/pdf/compliance/sample-company'))
    .flush(new Blob(['denied']), { status: 403, statusText: 'Forbidden' });
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('branch assignments');
  expect(click).not.toHaveBeenCalled();
  expect(fixture.componentInstance.pdfLoading).toBe(false);
  http.verify();
});

it('revokes the download URL after the browser has consumed it', async () => {
  const { http } = await setup();
  vi.useFakeTimers();
  try {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cleanup-test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    TestBed.inject(ReportsService).downloadPdf('dtss', 'sample-company').subscribe();
    http.expectOne(r => r.url.endsWith('/reports/pdf/dtss/sample-company')).flush(new Blob(['pdf']));
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:cleanup-test');
    expect(document.querySelector('a[download]')).toBeNull();
    http.verify();
  } finally { vi.useRealTimers(); }
});
