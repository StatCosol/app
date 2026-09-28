import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { page } from 'vitest/browser';
import { BillingEmailLogsComponent } from './billing-email-logs.component';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { AuthService } from '../../../core/auth.service';
import { InvoiceEmailLog } from '../models/billing.models';

const sample = (status = 'UNKNOWN'): InvoiceEmailLog =>
  ({
    id: 'sample',
    toEmail: 'sample@example.invalid',
    subject: 'Synthetic invoice email',
    sentStatus: 'NOT_SENT',
    delivery: { id: 'sample', status, acceptedAt: status === 'RECONCILED' ? '2026-09-29T00:00:00Z' : undefined },
    invoice: { id: 'invoice', invoiceNumber: 'TEST/2627/0042' },
  }) as InvoiceEmailLog;

async function setup(role = 'ADMIN') {
  const api = {
    getEmailLogs: vi.fn(() => of({ data: [sample()], totalPages: 2 } as any)),
    resolveInvoiceDelivery: vi.fn(() => of({ success: true } as any)),
    getInvoiceFileInventory: vi.fn(() =>
      of({
        deletionEnabled: false,
        scanned: 1,
        minAgeDays: 365,
        truncated: false,
        items: [{ name: 'sample.pdf', bytes: 120, ageDays: 400, status: 'UNREGISTERED' }],
      } as any),
    ),
  };
  await TestBed.configureTestingModule({
    imports: [BillingEmailLogsComponent],
    providers: [
      provideRouter([]),
      { provide: AccountsBillingService, useValue: api },
      { provide: AuthService, useValue: { getRoleCode: () => role } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(BillingEmailLogsComponent);
  fixture.detectChanges();
  return { api, fixture, c: fixture.componentInstance };
}
afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('Invoice email delivery review', () => {
  it('shows saved delivery state and explicit IST time', async () => {
    const { c, fixture } = await setup();
    expect(fixture.nativeElement.textContent).toContain('Needs verification');
    c.logs = [sample('RECONCILED')];
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('29 Sep 2026, 05:30');
  });
  it('hides and blocks privileged actions for accounts users', async () => {
    const { c, api, fixture } = await setup('ACCOUNTS');
    expect(fixture.nativeElement.textContent).not.toContain('Review outcome');
    expect(fixture.nativeElement.textContent).not.toContain('Invoice PDF inventory');
    c.openReview(sample());
    c.loadInventory();
    c.resolve();
    expect(c.selected).toBeNull();
    expect(api.resolveInvoiceDelivery).not.toHaveBeenCalled();
    expect(api.getInvoiceFileInventory).not.toHaveBeenCalled();
  });
  it('requires evidence and provider confirmation, blocks double saves and never sends email', async () => {
    const { c, api } = await setup();
    const pending = new Subject<any>();
    api.resolveInvoiceDelivery.mockReturnValue(pending);
    c.openReview(sample());
    c.resolve();
    expect(api.resolveInvoiceDelivery).not.toHaveBeenCalled();
    c.note = 'Provider confirmed no delivery';
    c.resolve();
    expect(api.resolveInvoiceDelivery).not.toHaveBeenCalled();
    c.providerVerified = true;
    c.outcome = 'NOT_SENT';
    c.resolve();
    c.resolve();
    expect(api.resolveInvoiceDelivery).toHaveBeenCalledExactlyOnceWith(
      'sample',
      'NOT_SENT',
      c.note,
      true,
    );
    pending.next({ success: true });
    pending.complete();
    expect(c.selected).toBeNull();
    expect(c.message).toContain('No email was sent');
    expect(c.saving).toBe(false);
    expect(api.getEmailLogs).toHaveBeenCalledTimes(2);
  });
  it('preserves review evidence after rejection and ignores non-uncertain deliveries', async () => {
    const { c, api } = await setup();
    c.openReview(sample('RECONCILED'));
    expect(c.selected).toBeNull();
    c.openReview(sample());
    c.note = 'Provider verification reference';
    c.providerVerified = true;
    api.resolveInvoiceDelivery.mockReturnValue(throwError(() => ({ status: 409 })));
    c.resolve();
    expect(c.saving).toBe(false);
    expect(c.selected).not.toBeNull();
    expect(c.error).toContain('Refresh');
    expect(c.note).toContain('reference');
  });
  it('shows load failures distinctly and prevents stale responses replacing a refresh', async () => {
    const { c, api, fixture } = await setup();
    const pending = new Subject<any>();
    api.getEmailLogs.mockReturnValueOnce(pending);
    c.load();
    c.load();
    pending.next({ data: [sample('STALE')], totalPages: 9 });
    expect(c.logs[0].delivery?.status).toBe('UNKNOWN');
    api.getEmailLogs.mockReturnValue(throwError(() => new Error('unavailable')));
    c.load();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Email logs unavailable');
    expect(fixture.nativeElement.textContent).not.toContain('No email logs');
  });
  it('blocks invalid inventory ages and exposes partial, read-only results', async () => {
    const { c, api, fixture } = await setup();
    c.minAgeDays = 0;
    c.loadInventory();
    expect(api.getInvoiceFileInventory).not.toHaveBeenCalled();
    api.getInvoiceFileInventory.mockReturnValue(
      of({ deletionEnabled: false, scanned: 0, items: [], truncated: true }),
    );
    c.minAgeDays = 365;
    c.loadInventory();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Deletion disabled');
    expect(fixture.nativeElement.textContent).toContain('Partial inventory');
  });
  it('reports inventory failure and releases the loading state', async () => {
    const { c, api } = await setup();
    api.getInvoiceFileInventory.mockReturnValue(throwError(() => new Error('failed')));
    c.loadInventory();
    expect(c.inventoryError).toContain('No files were changed');
    expect(c.inventoryLoading).toBe(false);
  });
  it.each([
    { width: 1365, height: 900 },
    { width: 390, height: 844 },
  ])('fits review controls at $width pixels', async (viewport) => {
    await page.viewport(viewport.width, viewport.height);
    const { c, fixture } = await setup();
    c.openReview(sample());
    c.note = 'Synthetic provider receipt verified';
    c.providerVerified = true;
    c.loadInventory();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
    for (const button of fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>) {
      const box = button.getBoundingClientRect();
      expect(box.width).toBeGreaterThan(20);
      const region = button.closest('[role="region"]') as HTMLElement | null;
      if (region) {
        region.scrollLeft = region.scrollWidth;
        expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(
          region.getBoundingClientRect().right + 1,
        );
        region.scrollLeft = 0;
      } else expect(box.right).toBeLessThanOrEqual(viewport.width + 1);
    }
    await page.screenshot({ path: `../../../../../../docs/reviews/2026-09-29/billing-delivery-${viewport.width}.png`, element: fixture.nativeElement });
  });
});
