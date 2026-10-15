import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { BillingInvoicesComponent } from './billing-invoices.component';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { Invoice } from '../models/billing.models';

const row = (id: string, overrides: Partial<Invoice> = {}): Invoice => ({
  id, invoiceNumber: id, invoiceType: 'PROFORMA', invoiceStatus: 'APPROVED',
  paymentStatus: 'UNPAID', amountReceived: 0, grandTotal: 100, balanceOutstanding: 100,
  invoiceDate: '2026-10-16', ...overrides,
} as Invoice);
const tax = row('TAX-001', { invoiceType: 'TAX_INVOICE', invoiceStatus: 'DRAFT' });

async function setup() {
  const records = [row('PI-001', { convertedInvoice: tax }), row('PI-002'),
    row('PI-003', { convertedInvoice: row('TAX-CANCELLED', { invoiceType: 'TAX_INVOICE', invoiceStatus: 'CANCELLED' }) }),
    row('TAX-001', { invoiceType: 'TAX_INVOICE', convertedFromProformaId: 'PI-001', proformaReferenceNumber: 'PI-001' })];
  const api = { getInvoices: vi.fn(() => of({ data: records, total: 80, totalPages: 4 })) };
  await TestBed.configureTestingModule({ imports: [BillingInvoicesComponent], providers: [provideRouter([]),
    { provide: AccountsBillingService, useValue: api }] }).compileComponents();
  const fixture = TestBed.createComponent(BillingInvoicesComponent);
  fixture.detectChanges(); await fixture.whenStable();
  const select = async (label: string, value: string) => {
    const element = fixture.nativeElement.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
    element.value = value; element.dispatchEvent(new Event('change')); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  };
  return { fixture, api, component: fixture.componentInstance, select };
}
afterEach(() => TestBed.resetTestingModule());

describe('Proforma conversion visibility', () => {
  it('highlights only proformas with a non-cancelled tax invoice and links both directions', async () => {
    const { fixture } = await setup();
    const converted = fixture.nativeElement.querySelector('[data-invoice-id="PI-001"]');
    expect(converted.classList.contains('proforma-converted')).toBe(true);
    expect(converted.textContent).toContain('Tax invoice created');
    expect(converted.textContent).toContain('DRAFT');
    expect(converted.querySelector('a[href="/accounts/invoices/TAX-001"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-invoice-id="TAX-001"] a[href="/accounts/invoices/PI-001"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('tr.proforma-converted').length).toBe(1);
    expect(fixture.nativeElement.querySelector('[data-invoice-id="PI-002"]').textContent).toContain('Tax invoice not created');
    expect(fixture.nativeElement.querySelector('[data-invoice-id="PI-003"]').textContent).toContain('Tax invoice cancelled');
  });
  it('provides a Proforma Invoice filter and resets pagination and incompatible payment filters', async () => {
    const { component, api, select, fixture } = await setup();
    component.page = 4; component.paymentFilter = 'UNPAID';
    await select('Invoice type', 'PROFORMA');
    expect(api.getInvoices).toHaveBeenLastCalledWith({ page: '1', invoiceType: 'PROFORMA' });
    expect(fixture.nativeElement.querySelector('select[aria-label="Payment status"]').disabled).toBe(true);
  });
  it.each(['CONVERTED', 'PENDING', 'CANCELLED'])('filters proformas by %s on the server', async status => {
    const { component, api, select } = await setup();
    component.page = 3; component.paymentFilter = 'PAID';
    await select('Proforma conversion status', status);
    expect(api.getInvoices).toHaveBeenLastCalledWith({ page: '1', invoiceType: 'PROFORMA', conversionStatus: status });
    await select('Invoice type', 'TAX_INVOICE');
    expect(api.getInvoices).toHaveBeenLastCalledWith({ page: '1', invoiceType: 'TAX_INVOICE' });
  });
});
