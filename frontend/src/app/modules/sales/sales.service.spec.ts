import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { SalesService } from './sales.service';

describe('SalesService', () => {
  let service: SalesService;
  const mockHttp = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SalesService(mockHttp);
  });

  it('list builds query params and calls leads endpoint', () => {
    mockHttp.get.mockReturnValue(of({ items: [], total: 0, limit: 25, offset: 0 }));
    service.list({ bucket: 'open', stage: 'NEW', limit: 10 }).subscribe();
    expect(mockHttp.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/sales/leads'),
      expect.objectContaining({
        params: expect.any(Object),
      }),
    );
  });

  it('create posts new lead', () => {
    mockHttp.post.mockReturnValue(of({ id: 'l1', companyName: 'Acme' }));
    service.create({ companyName: 'Acme' }).subscribe();
    expect(mockHttp.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/sales/leads'),
      { companyName: 'Acme' },
    );
  });

  it('ceoSalesSummary calls CEO summary endpoint', () => {
    mockHttp.get.mockReturnValue(of({ byStage: [], totals: null, byOwner: [] }));
    service.ceoSalesSummary().subscribe();
    expect(mockHttp.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/ceo/sales/summary'),
    );
  });

  it('ceoReceivables calls receivables summary endpoint', () => {
    mockHttp.get.mockReturnValue(of({ buckets: [], totals: {}, topClients: [] }));
    service.ceoReceivables().subscribe();
    expect(mockHttp.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/ceo/receivables/summary'),
    );
  });
});
