import { CrmDashboardController } from './crm-dashboard.controller';
describe('CRM dashboard response contract', () => {
  it('normalizes numeric PostgreSQL counts and names containing digits', async () => {
    const c = new CrmDashboardController({
      getKpis: async () => ({
        expiring_30_count: '0',
        pending_review_count: '2',
        reupload_required_count: '3',
      }),
    } as any);
    expect(await c.getKpis({ id: 'crm' } as any)).toEqual({
      expiring30Count: 0,
      pendingReviewCount: 2,
      reuploadRequiredCount: 3,
    });
  });
  it('preserves missing KPI data rather than claiming zero', async () => {
    const c = new CrmDashboardController({
      getKpis: async () => ({ expiring_30_count: null }),
    } as any);
    expect(await c.getKpis({ id: 'crm' } as any)).toEqual({
      expiring30Count: null,
    });
  });
  it('serializes dates rather than converting them to empty objects', async () => {
    const c = new CrmDashboardController({
      getPendingDocuments: async () => [
        {
          requestedOn: new Date('2026-10-14T09:00:00Z'),
          pendingDays: 6,
          documentType: 'BANK_PAYMENT_PROOF',
        },
      ],
    } as any);
    expect(
      await c.getPendingDocuments({ id: 'crm' } as any, {} as any),
    ).toEqual({
      items: [
        {
          requestedOn: '2026-10-14T09:00:00.000Z',
          pendingDays: 6,
          documentType: 'BANK_PAYMENT_PROOF',
        },
      ],
    });
  });
});
