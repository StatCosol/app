import { InvoiceDeliveryService } from '../services/invoice-delivery.service';
import { InvoiceDeliveryRecoveryJob } from './invoice-delivery-recovery.job';

describe('Invoice receipt recovery schedule', () => {
  it('does not overlap runs and releases its guard after failure', async () => {
    let reject!: (error: Error) => void;
    const recover = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, fail) => {
            reject = fail;
          }),
      )
      .mockResolvedValue(undefined);
    const job = new InvoiceDeliveryRecoveryJob({
      recover,
    } as unknown as InvoiceDeliveryService);
    const first = job.handle();
    await job.handle();
    expect(recover).toHaveBeenCalledTimes(1);
    reject(new Error('synthetic failure'));
    await first;
    await job.handle();
    expect(recover).toHaveBeenCalledTimes(2);
  });
});
