import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

import {
  BillingSetting,
  BillingClient,
  Invoice,
  InvoiceItem,
  InvoicePayment,
  InvoiceEmailLog,
  InvoiceAuditLog,
  RecurringInvoiceConfig,
  PendingPaymentFollowup,
} from './entities';

import {
  BillingCalculationService,
  BillingNumberService,
  InvoicesService,
  InvoicePaymentsService,
  InvoiceTemplateService,
  InvoicePdfService,
  InvoiceEmailService,
  BillingClientsService,
  BillingSettingsService,
  RecurringInvoicesService,
  PendingPaymentFollowupsService,
  BillingReportsService,
} from './services';

import { InvoicesController } from './controllers/invoices.controller';
import { InvoicePaymentsController } from './controllers/invoice-payments.controller';
import { BillingClientsController } from './controllers/billing-clients.controller';
import { BillingSettingsController } from './controllers/billing-settings.controller';
import { InvoicePdfEmailController } from './controllers/invoice-pdf-email.controller';
import { RecurringInvoicesController } from './controllers/recurring-invoices.controller';
import { PendingPaymentFollowupsController } from './controllers/pending-payment-followups.controller';
import { RecurringInvoiceCron } from './jobs/recurring-invoice.cron';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BillingSetting,
      BillingClient,
      Invoice,
      InvoiceItem,
      InvoicePayment,
      InvoiceEmailLog,
      InvoiceAuditLog,
      RecurringInvoiceConfig,
      PendingPaymentFollowup,
    ]),
    EmailModule,
    AuditLogsModule,
  ],
  controllers: [
    InvoicesController,
    InvoicePaymentsController,
    BillingClientsController,
    BillingSettingsController,
    InvoicePdfEmailController,
    RecurringInvoicesController,
    PendingPaymentFollowupsController,
  ],
  providers: [
    BillingCalculationService,
    BillingNumberService,
    InvoicesService,
    InvoicePaymentsService,
    InvoiceTemplateService,
    InvoicePdfService,
    InvoiceEmailService,
    BillingClientsService,
    BillingSettingsService,
    RecurringInvoicesService,
    PendingPaymentFollowupsService,
    BillingReportsService,
    RecurringInvoiceCron,
  ],
  exports: [InvoicesService, BillingClientsService],
})
export class AccountsBillingModule {}
