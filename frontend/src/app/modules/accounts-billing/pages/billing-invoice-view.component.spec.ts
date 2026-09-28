import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { page } from 'vitest/browser';
import { BillingInvoiceViewComponent } from './billing-invoice-view.component';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { Invoice } from '../models/billing.models';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../shared/toast/toast.service';

const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'a', invoiceNumber: 'TEST/2627/0042', invoiceType: 'TAX_INVOICE',
  invoiceDate: '2026-09-27', dueDate: '2026-10-27', financialYear: '2026-27',
  invoiceStatus: 'APPROVED', paymentStatus: 'UNPAID', mailStatus: 'NOT_SENT',
  grandTotal: 100, balanceOutstanding: 100, amountReceived: 0,
  subTotal: 100, discountTotal: 0, taxableValue: 100, cgstRate: 0, cgstAmount: 0,
  sgstRate: 0, sgstAmount: 0, igstRate: 0, igstAmount: 0, roundOff: 0,
  createdBy: 'sample', createdAt: '2026-09-27T00:00:00Z', payments: [],
  billingClient: { legalName: 'Synthetic Billing Client', billingEmail: 'sample@example.invalid',
    billingAddress: 'Sample address', stateName: 'Telangana', stateCode: '36' } as any,
  items: [{ serviceDescription: 'Sample compliance services', quantity: 1, rate: 100,
    amount: 100, taxableAmount: 100, gstRate: 0, gstAmount: 0, lineTotal: 100 }],
  ...overrides,
});

async function setup(overrides: Partial<Invoice> = {}) {
  const params = new BehaviorSubject(convertToParamMap({ id: 'a' }));
  const api = {
    getInvoice: vi.fn((id: string) => of(invoice({ ...overrides, id }))),
    approveInvoice: vi.fn(() => of(invoice())),
    cancelInvoice: vi.fn(() => of(invoice({ invoiceStatus: 'CANCELLED' }))),
    recordPayment: vi.fn(() => of({} as any)),
    sendInvoiceEmail: vi.fn(() => of({ success: true } as any)),
    generatePdf: vi.fn(() => of(new Blob())),
    convertProformaToTaxInvoice: vi.fn(() => of(invoice({ id: 'tax' }))),
  };
  const toast = { error: vi.fn(), success: vi.fn(), warning: vi.fn() };
  const dialog = { confirm: vi.fn(() => Promise.resolve(true)) };
  await TestBed.configureTestingModule({
    imports: [BillingInvoiceViewComponent],
    providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: params } },
      { provide: AccountsBillingService, useValue: api },
      { provide: ConfirmDialogService, useValue: dialog },
      { provide: ToastService, useValue: toast },
    ],
  }).compileComponents();
  const create = () => {
    const fixture = TestBed.createComponent(BillingInvoiceViewComponent);
    fixture.detectChanges();
    return fixture;
  };
  return { api, params, toast, dialog, create };
}

afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

describe('Invoice action availability', () => {
  it.each([
    ['DRAFT', 'UNPAID', 'TAX_INVOICE', 0, 100, true, false],
    ['APPROVED', 'UNPAID', 'TAX_INVOICE', 0, 100, true, true],
    ['GENERATED', 'UNPAID', 'TAX_INVOICE', 0, 100, true, true],
    ['EMAILED', 'UNPAID', 'TAX_INVOICE', 0, 100, true, true],
    ['OVERDUE', 'UNPAID', 'TAX_INVOICE', 0, 100, true, true],
    ['PARTIALLY_PAID', 'PARTIALLY_PAID', 'TAX_INVOICE', 40, 60, false, true],
    ['PAID', 'PAID', 'TAX_INVOICE', 100, 0, false, false],
    ['CANCELLED', 'UNPAID', 'TAX_INVOICE', 0, 100, false, false],
    ['APPROVED', 'UNPAID', 'PROFORMA', 0, 100, true, false],
    ['APPROVED', 'PARTIALLY_PAID', 'TAX_INVOICE', 40, 60, false, true],
    ['APPROVED', 'UNPAID', 'TAX_INVOICE', 40, 60, false, true],
    ['APPROVED', 'UNPAID', 'TAX_INVOICE', 0, 0, true, false],
  ])('%s/%s %s with received %s and balance %s', async (status, paymentStatus, type, received, balance, cancel, pay) => {
    const { create, api } = await setup({ invoiceStatus: status as string, paymentStatus: paymentStatus as string,
      invoiceType: type as string, amountReceived: received as number, balanceOutstanding: balance as number });
    const f = create(); const c = f.componentInstance;
    const buttons = Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).map(b => b.textContent?.trim());
    expect(buttons.includes('Cancel')).toBe(cancel);
    expect(buttons.includes('+ Record Payment')).toBe(pay);
    if (!pay) { c.submitPayment(); expect(api.recordPayment).not.toHaveBeenCalled(); }
    if (!cancel) { await c.cancel(); expect(api.cancelInvoice).not.toHaveBeenCalled(); }
  });

  it('blocks repeat approvals and reports server rejection', async () => {
    const { create, api, toast } = await setup({ invoiceStatus: 'DRAFT' });
    const pending = new Subject<Invoice>(); api.approveInvoice.mockReturnValue(pending);
    const f = create(); const c = f.componentInstance;
    c.approve(); c.approve(); f.detectChanges();
    expect(api.approveInvoice).toHaveBeenCalledTimes(1);
    const approve = Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(b => b.textContent?.trim() === 'Approve')!;
    expect(approve.disabled).toBe(true);
    pending.error({ error: { message: 'Invoice was cancelled by another user' } });
    expect(toast.error).toHaveBeenCalledWith('Invoice was cancelled by another user');
    expect(c.actionBusy).toBe(false);
  });

  it('does not cancel a new invoice after an old confirmation resolves', async () => {
    const { create, api, params, dialog } = await setup();
    let confirm!: (value: boolean) => void;
    dialog.confirm.mockReturnValue(new Promise(resolve => { confirm = resolve; }));
    const c = create().componentInstance;
    const request = c.cancel(); await c.cancel();
    expect(dialog.confirm).toHaveBeenCalledTimes(1);
    params.next(convertToParamMap({ id: 'b' })); confirm(true); await request;
    expect(api.cancelInvoice).not.toHaveBeenCalled(); expect(c.invoice?.id).toBe('b');
    expect(c.actionBusy).toBe(false);
  });

  it('recovers from cancellation rejection', async () => {
    const { create, api, toast } = await setup();
    api.cancelInvoice.mockReturnValue(throwError(() => ({ error: { message: 'Invoice has payments' } })));
    const c = create().componentInstance; await c.cancel();
    expect(toast.error).toHaveBeenCalledWith('Invoice has payments'); expect(c.actionBusy).toBe(false);
  });
});

describe('Payment and email outcomes', () => {
  it('keeps a visible reconciliation warning after accepted mail with failed bookkeeping', async () => {
    const { create, api, toast } = await setup();
    api.sendInvoiceEmail.mockReturnValue(of({ success: true, statusUpdatePending: true, warning: 'Accepted. Do not resend; reconcile status.' }));
    const fixture = create();
    const c = fixture.componentInstance;
    c.showEmailModal = true;
    c.submitEmail();
    fixture.detectChanges();
    expect(c.showEmailModal).toBe(false);
    expect(c.sendingEmail).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Do not resend; reconcile status.');
  });
  it('uses numeric defaults, blocks repeats and retains rejected payment inputs', async () => {
    const { create, api, toast } = await setup({ balanceOutstanding: '100.00' as any });
    const pending = new Subject<any>(); api.recordPayment.mockReturnValue(pending);
    const c = create().componentInstance; c.openPayment();
    expect(c.payForm.amountReceived).toBe(100);
    c.payForm.tdsAmount = 10; c.payForm.referenceNumber = 'sample reference';
    c.submitPayment(); c.submitPayment();
    expect(api.recordPayment).toHaveBeenCalledExactlyOnceWith('a', expect.objectContaining({ amountReceived: 100, tdsAmount: 10, otherDeduction: 0 }));
    pending.error({ error: { message: ['Balance changed', 'Refresh invoice'] } });
    expect(toast.error).toHaveBeenCalledWith('Balance changed. Refresh invoice');
    expect(c.showPaymentModal).toBe(true); expect(c.payForm.referenceNumber).toBe('sample reference');
    expect(c.actionBusy).toBe(false);
  });

  it.each([
    { amountReceived: -1 }, { amountReceived: 101 }, { amountReceived: 10.001 },
    { amountReceived: Infinity }, { tdsAmount: -1 }, { tdsAmount: 100 },
    { otherDeduction: 101 }, { paymentDate: '' },
  ])('rejects invalid payment input %j before posting', async values => {
    const { create, api, toast } = await setup(); const c = create().componentInstance;
    c.openPayment(); Object.assign(c.payForm, values); c.submitPayment();
    expect(api.recordPayment).not.toHaveBeenCalled(); expect(toast.error).toHaveBeenCalled();
  });

  it('does not treat HTTP success with failed delivery as a sent email', async () => {
    const { create, api, toast } = await setup();
    api.sendInvoiceEmail.mockReturnValue(of({ success: false, error: 'Delivery unavailable' }));
    const c = create().componentInstance; c.showEmailModal = true; c.emailForm.body = 'Retain this draft';
    c.submitEmail();
    expect(toast.error).toHaveBeenCalledWith('Delivery unavailable'); expect(toast.success).not.toHaveBeenCalled();
    expect(c.showEmailModal).toBe(true); expect(c.emailForm.body).toBe('Retain this draft');
    expect(api.getInvoice).toHaveBeenCalledTimes(1); expect(c.actionBusy).toBe(false);
  });

  it('blocks duplicate emails, reports transport errors and can retry successfully', async () => {
    const { create, api, toast } = await setup(); const pending = new Subject<any>();
    api.sendInvoiceEmail.mockReturnValueOnce(pending);
    const c = create().componentInstance; c.showEmailModal = true; c.submitEmail(); c.submitEmail();
    expect(api.sendInvoiceEmail).toHaveBeenCalledTimes(1);
    pending.error({ status: 503 }); expect(toast.error).toHaveBeenCalledWith('Could not send invoice email');
    expect(c.showEmailModal).toBe(true); c.submitEmail();
    expect(toast.success).toHaveBeenCalledWith('Invoice email sent'); expect(c.showEmailModal).toBe(false);
  });
});

describe('Invoice navigation and loading', () => {
  it('reloads reused routes and ignores stale reads/actions', async () => {
    const { create, api, params } = await setup({ invoiceStatus: 'DRAFT' });
    const old = new Subject<Invoice>(); api.getInvoice.mockReturnValueOnce(old);
    const f = create(); const c = f.componentInstance;
    params.next(convertToParamMap({ id: 'b' })); old.next(invoice());
    expect(c.invoice?.id).toBe('b'); expect(old.observed).toBe(false);
    const action = new Subject<Invoice>(); api.approveInvoice.mockReturnValueOnce(action); c.approve();
    params.next(convertToParamMap({ id: 'c' })); action.next(invoice());
    expect(c.invoice?.id).toBe('c'); expect(c.actionBusy).toBe(false); expect(action.observed).toBe(false);
    const last = new Subject<Invoice>(); api.getInvoice.mockReturnValueOnce(last); c.loadInvoice('c');
    f.destroy(); expect(last.observed).toBe(false);
  });

  it('clears stale details on a failed refresh and offers read-only retry', async () => {
    const { create, api } = await setup(); const f = create(); const c = f.componentInstance;
    api.getInvoice.mockReturnValueOnce(throwError(() => ({ status: 403 })));
    c.loadInvoice('a'); f.detectChanges();
    expect(c.invoice).toBeNull(); expect(f.nativeElement.textContent).toContain('Retry invoice');
    c.loadInvoice('a'); expect(c.invoice?.id).toBe('a'); expect(api.recordPayment).not.toHaveBeenCalled();
  });

  it('keeps an existing converted invoice accessible and prevents invalid new conversion', async () => {
    const { create } = await setup({ invoiceType: 'PROFORMA', invoiceStatus: 'CANCELLED' });
    const c = create().componentInstance; expect(c.canConvert()).toBe(false);
    c.invoice!.convertedInvoice = invoice({ id: 'tax' }); expect(c.canConvert()).toBe(true);
    c.invoice!.convertedInvoice = undefined; c.invoice!.invoiceStatus = 'APPROVED';
    c.invoice!.paymentStatus = 'PARTIALLY_PAID'; expect(c.canConvert()).toBe(false);
  });
});

it.each([390, 1440])('keeps invoice actions and payment dialog within the %ipx viewport', async width => {
  await page.viewport(width, 800); const { create } = await setup(); const f = create();
  await f.whenStable(); f.detectChanges(); const host = f.nativeElement as HTMLElement;
  expect(host.scrollWidth).toBeLessThanOrEqual(width);
  await page.screenshot({ element: host, path: `../../../../.vitest-attachments/billing-invoice-${width}.png` });
  f.componentInstance.openPayment(); f.detectChanges(); await f.whenStable();
  const modal = host.querySelector('.fixed > div') as HTMLElement;
  const rect = modal.getBoundingClientRect();
  expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width);
  expect(rect.top).toBeGreaterThanOrEqual(0); expect(rect.bottom).toBeLessThanOrEqual(800);
  await page.screenshot({ element: modal, path: `../../../../.vitest-attachments/billing-payment-${width}.png` });
});
