import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { expect, vi } from 'vitest';
import { page } from 'vitest/browser';
import { RegisterPreparationComponent } from './register-preparation.component';

describe('Register generation button feedback', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(async () => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
    await page.viewport(1280, 720);
  });
  function setup() {
    const fixture = TestBed.createComponent(RegisterPreparationComponent);
    const c = fixture.componentInstance;
    Object.assign(c, { formId: 'example-register', branchId: 'example-branch', year: 2026, month: 3,
      eligible: true, capacityRequired: true,
      fields: [{ key: 'name', label: 'Employee name', required: true, type: 'text' }],
      rows: [{ name: 'Example worker' }],
    });
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const feedback = root.querySelector<HTMLElement>('[data-testid="register-generation-feedback"]')!;
    const button = [...root.querySelectorAll('button')].find(b => b.textContent?.includes('Generate and save'))!;
    return { fixture, c, root, feedback, button, http: TestBed.inject(HttpTestingController) };
  }
  it('shows and focuses missing-field feedback beside the clicked button on a phone', async () => {
    await page.viewport(390, 844);
    const { fixture, feedback, button, http } = setup();
    button.scrollIntoView({ block: 'end' });
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectNone(r => r.url.endsWith('/generate'));
    expect(feedback.querySelector('[role="alert"]')?.textContent).toContain('your company’s responsibility');
    expect(document.activeElement).toBe(feedback);
    expect(feedback.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight + 1);
    expect(feedback.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    expect(button.disabled).toBe(false);
    await page.screenshot({ path: '__screenshots__/register-generation-validation-phone.png' });
  });
  it('shows saving, prevents repeat submissions, displays server Blob errors and confirms a successful retry', async () => {
    const { fixture, c, feedback, button, http } = setup();
    c.actingCapacity = 'DIRECT_EMPLOYER';
    const generated = vi.fn();
    c.generated.subscribe(generated);
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    button.click();
    fixture.detectChanges();
    expect(button.textContent).toContain('Generating and saving');
    expect(button.disabled).toBe(true);
    expect(feedback.textContent).toContain('Please wait');
    c.generate();
    const request = http.expectOne(r => r.url.endsWith('/generate'));
    request.flush(new Blob([JSON.stringify({ errors: ['Gross wages must agree with supporting records'] })], { type: 'application/json' }), { status: 422, statusText: 'Unprocessable Entity' });
    await expect.poll(() => c.error).toContain('Gross wages must agree');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(feedback.querySelector('[role="alert"]')?.textContent).toContain('Gross wages must agree');
    expect(button.disabled).toBe(false);
    expect(generated).not.toHaveBeenCalled();
    button.click();
    http.expectOne(r => r.url.endsWith('/generate')).flush(new Blob(['example workbook']));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(feedback.textContent).toContain('Register saved for review. Download started.');
    expect(feedback.querySelector('[role="alert"]')).toBeNull();
    expect(generated).toHaveBeenCalledExactlyOnceWith({ branchId: 'example-branch', year: 2026, month: 3 });
    expect(download).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(false);
  });
  it('refreshes saved files even when the browser cannot start the download', async () => {
    const { fixture, c, feedback, button, http } = setup();
    c.actingCapacity = 'DIRECT_EMPLOYER';
    const generated = vi.fn();
    c.generated.subscribe(generated);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { throw new Error('Download unavailable'); });
    button.click();
    http.expectOne(r => r.url.endsWith('/generate')).flush(new Blob(['example workbook']));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(feedback.textContent).toContain('Register saved for review, but the download could not start');
    expect(generated).toHaveBeenCalledTimes(1);
    expect(c.busy).toBe(false);
  });
  it('ends a stalled request and tells users to check saved files before retrying', async () => {
    const { c, http } = setup();
    c.actingCapacity = 'DIRECT_EMPLOYER';
    vi.useFakeTimers();
    c.generate();
    const request = http.expectOne(r => r.url.endsWith('/generate'));
    await vi.advanceTimersByTimeAsync(120000);
    expect(request.cancelled).toBe(true);
    expect(c.busy).toBe(false);
    expect(c.generating).toBe(false);
    expect(c.error).toContain('Check saved registers before trying again');
  });
});
