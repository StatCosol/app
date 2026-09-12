import { InvoicePaymentsService } from './invoice-payments.service';
describe('Receipt allocation', () => {
  it.each([
    ['0', '0001'],
    ['9999', '10000'],
    ['10000', '10001'],
  ])('allocates after numeric maximum %s', async (maximum, suffix) => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ maximum }]);
    const service = new InvoicePaymentsService({} as any, {} as any, {} as any);
    const result = await (service as any).generateReceiptNumber({ query });
    expect(result.endsWith('/' + suffix)).toBe(true);
    expect(query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(query.mock.calls[1][0]).toContain('::bigint');
    expect(query.mock.calls[0][1][0] + '%').toBe(query.mock.calls[1][1][0]);
  });
});
