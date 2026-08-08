import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { AccountsBillingService } from './accounts-billing.service';

describe('AccountsBillingService', () => {
  let service: AccountsBillingService;
  const mockHttp = { get: vi.fn(), post: vi.fn(), patch: vi.fn() } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AccountsBillingService(mockHttp);
  });

  it('getClients calls billing clients endpoint', () => {
    mockHttp.get.mockReturnValue(of({ items: [], total: 0 }));
    service.getClients({ status: 'ACTIVE' }).subscribe();
    expect(mockHttp.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/billing/clients'),
      { params: { status: 'ACTIVE' } },
    );
  });

  it('getDashboardStats calls stats endpoint', () => {
    mockHttp.get.mockReturnValue(of({ totalOutstanding: 0 }));
    service.getDashboardStats().subscribe();
    expect(mockHttp.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/billing/invoices/stats/dashboard'),
    );
  });

  it('approveInvoice posts to approve route', () => {
    mockHttp.post.mockReturnValue(of({ id: 'inv1', status: 'APPROVED' }));
    service.approveInvoice('inv1').subscribe();
    expect(mockHttp.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/billing/invoices/inv1/approve'),
      {},
    );
  });

  it('convertProformaToTaxInvoice posts conversion payload', () => {
    mockHttp.post.mockReturnValue(of({ id: 'inv1' }));
    const body = { purchaseOrderNumber: 'PO-99' };
    service.convertProformaToTaxInvoice('inv1', body).subscribe();
    expect(mockHttp.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/billing/invoices/inv1/convert-to-tax-invoice'),
      body,
    );
  });
});
