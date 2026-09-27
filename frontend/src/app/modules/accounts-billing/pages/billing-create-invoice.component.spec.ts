import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { page } from 'vitest/browser';
import { BillingCreateInvoiceComponent } from './billing-create-invoice.component';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { Invoice } from '../models/billing.models';

const sample = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'sample', invoiceNumber: 'TEST/2627/0042', invoiceType: 'TAX_INVOICE',
  invoiceDate: '2026-09-27', financialYear: '2026-27', dueDate: '',
  invoiceStatus: 'DRAFT', paymentStatus: 'UNPAID', amountReceived: 0,
  billingClient: { id: 'client', legalName: 'Synthetic Billing Client', billingCode: 'TEST',
    defaultGstRate: '0.00', stateCode: '36', stateName: 'Telangana' } as any,
  items: [{ serviceDescription: 'Sample compliance services', serviceCode: 'CODE',
    periodFrom: '2026-09-01', periodTo: '2026-09-30', sequence: 3,
    quantity: '2.00', rate: '100.00', discountAmount: '0.00', gstRate: '18.00' } as any],
  ...overrides,
} as Invoice);

async function setup(overrides: Partial<Invoice> = {}, edit = true) {
  const invoice = sample(overrides);
  const params = new BehaviorSubject(convertToParamMap(edit ? { id: 'sample' } : {}));
  const api = {
    getInvoice: vi.fn(() => of(invoice)),
    getActiveClients: vi.fn(() => of([invoice.billingClient!])),
    updateInvoice: vi.fn(() => of(invoice)),
    createInvoice: vi.fn(() => of(invoice)),
  };
  await TestBed.configureTestingModule({
    imports: [BillingCreateInvoiceComponent],
    providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: params } },
      { provide: AccountsBillingService, useValue: api },
    ],
  }).compileComponents();
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const create = () => {
    const fixture = TestBed.createComponent(BillingCreateInvoiceComponent);
    fixture.detectChanges();
    return fixture;
  };
  return { api, navigate, create, params };
}

afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

it('locks the assigned type, constrains the date and normalizes edit payloads without dropping line metadata', async () => {
  const { create, api } = await setup(); const f = create(); const c = f.componentInstance;
  expect(f.nativeElement.querySelector('[formControlName="invoiceType"]').disabled).toBe(true);
  const date = f.nativeElement.querySelector('[formControlName="invoiceDate"]') as HTMLInputElement;
  expect(date.min).toBe('2026-04-01'); expect(date.max).toBe('2027-03-31');
  c.onSubmit();
  expect(api.updateInvoice).toHaveBeenCalledExactlyOnceWith('sample', expect.objectContaining({
    dueDate: null, invoiceDate: '2026-09-27',
    items: [expect.objectContaining({ quantity: 2, rate: 100, gstRate: 18, discountAmount: 0,
      serviceCode: 'CODE', periodFrom: '2026-09-01', periodTo: '2026-09-30', sequence: 3 })],
  }));
  expect((api.updateInvoice.mock.calls[0] as any)[1]).not.toHaveProperty('invoiceType');
});

it.each(['2026-03-31', '2027-04-01'])('blocks dates outside the assigned financial year: %s', async invoiceDate => {
  const { create, api } = await setup(); const f = create(); const c = f.componentInstance;
  c.form.patchValue({ invoiceDate }); c.onSubmit(); f.detectChanges();
  expect(api.updateInvoice).not.toHaveBeenCalled();
  expect(f.nativeElement.textContent).toContain('Invoice date must remain in financial year 2026-27');
});

it.each(['2026-04-01', '2027-03-31'])('allows dates at either end of the assigned year: %s', async invoiceDate => {
  const { create, api } = await setup(); const c = create().componentInstance;
  c.form.patchValue({ invoiceDate }); c.onSubmit(); expect(api.updateInvoice).toHaveBeenCalledTimes(1);
});

it.each(['2026-03-31', '2027-04-01'])('allows an unchanged legacy date for a remarks-only edit: %s', async invoiceDate => {
  const { create, api } = await setup({ invoiceDate }); const f = create(); const c = f.componentInstance;
  const date = f.nativeElement.querySelector('[formControlName="invoiceDate"]') as HTMLInputElement;
  expect(c.form.valid).toBe(true);
  expect(date.checkValidity()).toBe(true);
  expect(date.min).toBe(''); expect(date.max).toBe('');
  c.form.patchValue({ remarks: 'Legacy date left unchanged' }); c.onSubmit();
  expect(api.updateInvoice).toHaveBeenCalledExactlyOnceWith('sample', expect.objectContaining({
    invoiceDate, remarks: 'Legacy date left unchanged',
  }));
});

it.each(['2026-03-31', '2027-04-01'])('restricts changes from a legacy date while allowing its exact restoration: %s', async invoiceDate => {
  const { create, api } = await setup({ invoiceDate }); const f = create(); const c = f.componentInstance;
  const date = f.nativeElement.querySelector('[formControlName="invoiceDate"]') as HTMLInputElement;
  c.form.patchValue({ invoiceDate: '2027-04-02' }); f.detectChanges(); c.onSubmit();
  expect(c.form.get('invoiceDate')!.hasError('financialYear')).toBe(true);
  expect(date.min).toBe('2026-04-01'); expect(date.max).toBe('2027-03-31');
  expect(date.checkValidity()).toBe(false);
  expect(api.updateInvoice).not.toHaveBeenCalled();
  c.form.patchValue({ invoiceDate: '2026-09-27' }); f.detectChanges();
  expect(c.form.valid).toBe(true); expect(date.checkValidity()).toBe(true);
  c.form.patchValue({ invoiceDate: '' }); f.detectChanges();
  expect(c.form.invalid).toBe(true);
  c.form.patchValue({ invoiceDate }); f.detectChanges(); c.onSubmit();
  expect(c.form.valid).toBe(true); expect(date.checkValidity()).toBe(true);
  expect(api.updateInvoice).toHaveBeenCalledExactlyOnceWith('sample', expect.objectContaining({ invoiceDate }));
});

it.each([
  { invoiceStatus: 'CANCELLED' }, { invoiceStatus: 'PAID' },
  { paymentStatus: 'PARTIALLY_PAID' }, { amountReceived: '40.00' as any },
])('blocks editing and submission when locked: %j', async values => {
  const { create, api } = await setup(values); const f = create();
  expect(f.nativeElement.querySelector('form')).toBeNull();
  f.componentInstance.onSubmit(); expect(api.updateInvoice).not.toHaveBeenCalled();
});

it('blocks duplicate submissions and preserves rejected edits for retry', async () => {
  const { create, api, navigate } = await setup(); const pending = new Subject<Invoice>();
  api.updateInvoice.mockReturnValueOnce(pending);
  const f = create(); const c = f.componentInstance;
  c.form.patchValue({ remarks: 'Keep this edit' }); c.onSubmit(); c.onSubmit(); f.detectChanges();
  expect(api.updateInvoice).toHaveBeenCalledTimes(1);
  expect(f.nativeElement.querySelector('fieldset').disabled).toBe(true);
  pending.error({ error: { message: ['Invoice changed', 'Please reload'] } }); f.detectChanges();
  expect(f.nativeElement.querySelector('[role="alert"]').textContent).toContain('Invoice changed. Please reload');
  expect(c.form.value.remarks).toBe('Keep this edit'); expect(c.saving).toBe(false);
  expect(navigate).not.toHaveBeenCalled(); c.onSubmit();
  expect(api.updateInvoice).toHaveBeenCalledTimes(2);
  expect(navigate).toHaveBeenCalledWith(['/accounts/invoices', 'sample']);
});

it('shows a fallback save error when the server provides no message', async () => {
  const { create, api } = await setup(); api.updateInvoice.mockReturnValue(throwError(() => new Error('offline')));
  const f = create(); f.componentInstance.onSubmit(); f.detectChanges();
  expect(f.nativeElement.textContent).toContain('Unable to save invoice. Please try again.');
});

it.each([{ gstRate: 101 }, { gstRate: -1 }, { discountAmount: -1 }])('rejects invalid line values: %j', async value => {
  const { create, api } = await setup(); const c = create().componentInstance;
  c.itemsArray.at(0).patchValue(value); c.onSubmit(); expect(api.updateInvoice).not.toHaveBeenCalled();
});

it('keeps invoice type editable on creation and uses numeric zero defaults for new lines', async () => {
  const { create, api } = await setup({}, false); const f = create(); const c = f.componentInstance;
  expect(c.form.get('invoiceType')!.enabled).toBe(true);
  c.form.patchValue({ billingClientId: 'client', invoiceType: 'PROFORMA' }); c.onClientChange();
  c.itemsArray.at(0).patchValue({ serviceDescription: 'Sample service', rate: 100 });
  expect(c.itemsArray.at(0).value.gstRate).toBe(0);
  c.addItem(); expect(c.itemsArray.at(1).value.gstRate).toBe(0); c.removeItem(1);
  c.onSubmit();
  expect(api.createInvoice).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ invoiceType: 'PROFORMA', dueDate: null }));
});

it('does not navigate after the edit component has been destroyed', async () => {
  const { create, api, navigate } = await setup(); const pending = new Subject<Invoice>(); api.updateInvoice.mockReturnValue(pending);
  const f = create(); f.componentInstance.onSubmit(); f.destroy(); pending.next(sample());
  expect(navigate).not.toHaveBeenCalled();
});

it('loads reused routes without letting an old response overwrite the new invoice', async () => {
  const { create, api, params } = await setup(); const first = new Subject<Invoice>();
  api.getInvoice.mockReturnValueOnce(first);
  const f = create();
  api.getInvoice.mockReturnValueOnce(of(sample({ id: 'second', remarks: 'Second invoice' })));
  params.next(convertToParamMap({ id: 'second' })); first.next(sample({ remarks: 'Old invoice' }));
  expect(f.componentInstance.invoiceId).toBe('second');
  expect(f.componentInstance.form.value.remarks).toBe('Second invoice');
  params.next(convertToParamMap({}));
  expect(f.componentInstance.isEditMode).toBe(false); expect(f.componentInstance.form.get('invoiceType')!.enabled).toBe(true);
  expect(f.componentInstance.minInvoiceDate).toBe('');
});

it('ignores a late save result after changing invoice routes', async () => {
  const { create, api, params, navigate } = await setup(); const pending = new Subject<Invoice>();
  api.updateInvoice.mockReturnValueOnce(pending); const c = create().componentInstance;
  c.onSubmit(); params.next(convertToParamMap({ id: 'second' })); pending.next(sample());
  expect(navigate).not.toHaveBeenCalled(); expect(c.saving).toBe(false);
});

it('retains the current inactive client even when the active-client request completes later', async () => {
  const { create, api } = await setup(); const clients = new Subject<any[]>(); api.getActiveClients.mockReturnValueOnce(clients);
  const f = create(); clients.next([]); f.detectChanges();
  const select = f.nativeElement.querySelector('[formControlName="billingClientId"]') as HTMLSelectElement;
  expect(select.value).toBe('client'); expect(f.componentInstance.clientOptions.map(c => c.id)).toEqual(['client']);
});

it('shows an invoice load failure and recovers through retry', async () => {
  const { create, api } = await setup(); api.getInvoice.mockReturnValueOnce(throwError(() => new Error('offline')));
  const f = create(); f.componentInstance.onSubmit(); expect(api.updateInvoice).not.toHaveBeenCalled();
  expect(f.nativeElement.textContent).toContain('Unable to load invoice');
  f.componentInstance.loadInvoice('sample'); f.detectChanges(); expect(f.nativeElement.querySelector('form')).not.toBeNull();
});

it.each([{ quantity: 0.001 }, { rate: 1.001 }, { discountAmount: 201 }])('blocks unsupported precision and excessive discounts: %j', async value => {
  const { create, api } = await setup(); const c = create().componentInstance;
  c.itemsArray.at(0).patchValue(value); c.onSubmit(); expect(api.updateInvoice).not.toHaveBeenCalled();
});

it('accepts fractional quantities at the database precision', async () => {
  const { create, api } = await setup(); const c = create().componentInstance;
  c.itemsArray.at(0).patchValue({ quantity: 0.25 }); c.onSubmit();
  expect(api.updateInvoice).toHaveBeenCalledTimes(1); expect(c.calcLineTotal(0)).toBe('29.50');
});

it.each([390, 1440])('keeps edit controls and long server errors within the %ipx viewport', async width => {
  await page.viewport(width, 800); const { create, api } = await setup();
  api.updateInvoice.mockReturnValue(throwError(() => ({ error: { message: 'Invoice date must remain in financial year 2026-27. Create a new invoice for a different financial year.' } })));
  const f = create(); f.componentInstance.onSubmit(); f.detectChanges(); await f.whenStable();
  const host = f.nativeElement as HTMLElement;
  expect(host.scrollWidth).toBeLessThanOrEqual(width);
  const rect = host.querySelector('[role="alert"]')!.getBoundingClientRect();
  expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width);
  await page.screenshot({ element: host, path: `../../../../.vitest-attachments/billing-edit-${width}.png` });
});
