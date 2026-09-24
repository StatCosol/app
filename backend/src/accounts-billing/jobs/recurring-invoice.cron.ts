import { createHash } from 'node:crypto';
import { operationalDate } from '../../common/operational-date';
import { InvoiceStatus, MailStatus } from '../enums';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { RecurringInvoiceConfig, BillingClient, Invoice } from '../entities';
import { BillingFrequency, InvoiceType } from '../enums';
import { InvoicesService } from '../services/invoices.service';
import { InvoiceEmailService } from '../services/invoice-email.service';
import { CronLockService } from '../../common/services/cron-lock.service';

/**
 * Generates and emails recurring invoices on the 1st of each month.
 * Picks any active config whose `next_run_date` is today or in the past,
 * creates an invoice, marks it APPROVED, emails it to the client's billingEmail,
 * then advances `next_run_date` by the configured frequency.
 *
 * Schedule: 09:00 Asia/Kolkata on the 1st of every month.
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
    private readonly cronLock: CronLockService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  @Cron('0 0 9 1 * *', { timeZone: 'Asia/Kolkata' })
  async runMonthly(): Promise<{
    due: number;
    ok: number;
    failed: number;
    skippedNoEmail: number;
  }> {
    const result = await this.cronLock.runExclusive(
      'recurring-invoice:runMonthly',
      () => this.doRun(),
    );
    return result ?? { due: 0, ok: 0, failed: 0, skippedNoEmail: 0 };
  }

  private async doRun(): Promise<{
    due: number;
    ok: number;
    failed: number;
    skippedNoEmail: number;
  }> {
    const today = operationalDate();
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
    let skippedNoEmail = 0;
    for (const cfg of configs) {
      try {
        const r = await this.processOne(cfg, today);
        if (r === 'no_email') skippedNoEmail++;
        else ok++;
      } catch (e) {
        failed++;
        this.log.error(
          `Recurring config ${cfg.id} failed: ${(e as Error).message}`,
        );
      }
    }
    this.log.log(
      `Recurring invoice run done: due=${configs.length} ok=${ok} failed=${failed} skippedNoEmail=${skippedNoEmail}`,
    );
    return { due: configs.length, ok, failed, skippedNoEmail };
  }

  private async processOne(
    cfg: RecurringInvoiceConfig,
    today: string,
  ): Promise<'ok' | 'no_email' | 'skipped'> {
    if (cfg.endDate && cfg.endDate < today) {
      cfg.isActive = false;
      await this.configRepo.save(cfg);
      this.log.log(`Config ${cfg.id} past end date - deactivated`);
      return 'skipped';
    }

    const client = await this.clientRepo.findOne({
      where: { id: cfg.billingClientId },
    });
    if (!client) {
      this.log.warn(`Config ${cfg.id} client not found - skipping`);
      return 'skipped';
    }

    // If this billing-client is linked to an operational client and that
    // client has been soft-deleted, do not auto-invoice or email them.
    if (client.clientId) {
      const linked: Array<{ is_deleted: boolean | null }> = await this.ds.query(
        `SELECT is_deleted FROM clients WHERE id = $1 LIMIT 1`,
        [client.clientId],
      );
      if (linked[0]?.is_deleted === true) {
        cfg.isActive = false;
        await this.configRepo.save(cfg);
        this.log.log(
          `Config ${cfg.id} linked client ${client.clientId} is soft-deleted - deactivated recurring invoice`,
        );
        return 'skipped';
      }
    }

    // A stable primary key protects a committed invoice across crashes/retries.
    // This only applies to new recurring runs; existing records are not rewritten.
    const invoiceId = recurringInvoiceId(cfg.id, cfg.nextRunDate);
    let invoice = await this.ds
      .getRepository(Invoice)
      .findOne({ where: { id: invoiceId } });
    if (!invoice) {
      invoice = await this.invoicesService.create(
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
            },
          ],
        },
        cfg.createdBy,
        invoiceId,
      );
    }
    if (invoice.billingClientId !== cfg.billingClientId) {
      throw new Error('Recurring invoice client mismatch');
    }
    if (invoice.invoiceStatus === InvoiceStatus.CANCELLED) {
      throw new Error(
        'Recurring invoice was cancelled; review its schedule before continuing',
      );
    }
    // Preserve the configured recurring workflow, but never email after failed approval.
    if (invoice.invoiceStatus === InvoiceStatus.DRAFT) {
      await this.invoicesService.approve(invoice.id, cfg.createdBy);
    }
    if (invoice.mailStatus !== MailStatus.SENT) {
      if (!client.billingEmail) return 'no_email';
      const delivery = await this.invoiceEmailService.sendInvoice(
        invoice.id,
        {
          toEmail: client.billingEmail,
          ccEmail: client.ccEmail || undefined,
          bccEmail: client.bccEmail || undefined,
        },
        cfg.createdBy,
      );
      if (!delivery.success)
        throw new Error(
          'Invoice created; email delivery failed. Retry reuses this invoice.',
        );
    }

    // 4) Advance next_run_date
    cfg.nextRunDate = this.advance(cfg.nextRunDate, cfg.frequency);
    await this.configRepo.save(cfg);
    return 'ok';
  }

  private advance(fromIso: string, freq: BillingFrequency): string {
    return advanceRecurringDate(fromIso, freq);
  }
}

export function recurringInvoiceId(configId: string, period: string): string {
  const hash = createHash('sha256')
    .update('statco-recurring:v1:' + configId + ':' + period)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function advanceRecurringDate(
  fromIso: string,
  freq: BillingFrequency,
): string {
  const [year, month, day] = fromIso.split('-').map(Number);
  const months =
    { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12, ONE_TIME: 1200 }[
      freq
    ] ?? 1200;
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}
