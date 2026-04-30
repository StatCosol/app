import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { RecurringInvoiceConfig, BillingClient } from '../entities';
import { BillingFrequency, InvoiceType } from '../enums';
import { InvoicesService } from '../services/invoices.service';
import { InvoiceEmailService } from '../services/invoice-email.service';

/**
 * Generates and emails recurring invoices on the 1st of each month.
 * Picks any active config whose `next_run_date` is today or in the past,
 * creates an invoice, marks it APPROVED, emails it to the client's billingEmail,
 * then advances `next_run_date` by the configured frequency.
 *
 * Schedule: 09:00 server time on the 1st of every month.
 * Container apps run UTC; 09:00 UTC = 14:30 IST. Acceptable for "1st of month" runs.
 */
@Injectable()
export class RecurringInvoiceCron {
  private readonly log = new Logger(RecurringInvoiceCron.name);

  constructor(
    @InjectRepository(RecurringInvoiceConfig)
    private readonly configRepo: Repository<RecurringInvoiceConfig>,
    @InjectRepository(BillingClient)
    private readonly clientRepo: Repository<BillingClient>,
    private readonly invoicesService: InvoicesService,
    private readonly invoiceEmailService: InvoiceEmailService,
  ) {}

  @Cron('0 0 9 1 * *')
  async runMonthly(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    this.log.log(`Recurring invoice run starting for date=${today}`);

    const configs = await this.configRepo.find({
      where: {
        isActive: true,
        nextRunDate: LessThanOrEqual(today),
      },
    });
    this.log.log(`Found ${configs.length} due recurring config(s)`);

    let ok = 0;
    let failed = 0;
    for (const cfg of configs) {
      try {
        await this.processOne(cfg, today);
        ok++;
      } catch (e) {
        failed++;
        this.log.error(
          `Recurring config ${cfg.id} failed: ${(e as Error).message}`,
        );
      }
    }
    this.log.log(`Recurring invoice run done: ok=${ok} failed=${failed}`);
  }

  private async processOne(
    cfg: RecurringInvoiceConfig,
    today: string,
  ): Promise<void> {
    if (cfg.endDate && cfg.endDate < today) {
      cfg.isActive = false;
      await this.configRepo.save(cfg);
      this.log.log(`Config ${cfg.id} past end date - deactivated`);
      return;
    }

    const client = await this.clientRepo.findOne({
      where: { id: cfg.billingClientId },
    });
    if (!client) {
      this.log.warn(`Config ${cfg.id} client not found - skipping`);
      return;
    }

    // 1) Create invoice
    const invoice = await this.invoicesService.create(
      {
        billingClientId: cfg.billingClientId,
        invoiceType: InvoiceType.TAX_INVOICE,
        invoiceDate: today,
        items: [
          {
            serviceDescription:
              cfg.serviceDescription || cfg.invoiceName || 'Monthly Services',
            quantity: 1,
            rate: Number(cfg.defaultAmount),
            gstRate: Number(cfg.defaultGstRate ?? 18),
          } as any,
        ],
      } as any,
      cfg.createdBy,
    );

    // 2) Auto-approve so it leaves DRAFT
    try {
      await this.invoicesService.approve(invoice.id, cfg.createdBy);
    } catch (e) {
      this.log.warn(
        `Auto-approve failed for invoice ${invoice.id}: ${(e as Error).message}`,
      );
    }

    // 3) Email to client billingEmail (if available)
    const toEmail = client.billingEmail;
    if (!toEmail) {
      this.log.warn(
        `Config ${cfg.id} client has no billingEmail - invoice created but not emailed`,
      );
    } else {
      await this.invoiceEmailService.sendInvoice(
        invoice.id,
        {
          toEmail,
          ccEmail: client.ccEmail || undefined,
        } as any,
        cfg.createdBy,
      );
    }

    // 4) Advance next_run_date
    cfg.nextRunDate = this.advance(cfg.nextRunDate, cfg.frequency);
    await this.configRepo.save(cfg);
  }

  private advance(fromIso: string, freq: BillingFrequency): string {
    const d = new Date(fromIso + 'T00:00:00');
    switch (freq) {
      case BillingFrequency.MONTHLY:
        d.setMonth(d.getMonth() + 1);
        break;
      case BillingFrequency.QUARTERLY:
        d.setMonth(d.getMonth() + 3);
        break;
      case BillingFrequency.HALF_YEARLY:
        d.setMonth(d.getMonth() + 6);
        break;
      case BillingFrequency.YEARLY:
        d.setFullYear(d.getFullYear() + 1);
        break;
      case BillingFrequency.ONE_TIME:
      default:
        // No further runs
        d.setFullYear(d.getFullYear() + 100);
        break;
    }
    return d.toISOString().slice(0, 10);
  }
}
