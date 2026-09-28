import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InvoiceDeliveryService } from '../services/invoice-delivery.service';

@Injectable()
export class InvoiceDeliveryRecoveryJob {
  private running = false;
  private readonly logger = new Logger(InvoiceDeliveryRecoveryJob.name);
  constructor(private readonly deliveries: InvoiceDeliveryService) {}
  @Cron('0 * * * * *', { name: 'invoice-delivery-reconciliation' })
  async handle() {
    if (this.running) return;
    this.running = true;
    try {
      await this.deliveries.recover();
    } catch {
      this.logger.error(
        'Invoice delivery reconciliation unavailable; receipts retained.',
      );
    } finally {
      this.running = false;
    }
  }
}
