import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';

import {
  BillingSetting,
  BillingClient,
  Invoice,
  InvoiceItem,
  InvoicePayment,
  InvoiceEmailLog,
  InvoiceAuditLog,
  RecurringInvoiceConfig,
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
} from './services';

import { InvoicesController } from './controllers/invoices.controller';
import { InvoicePaymentsController } from './controllers/invoice-payments.controller';
import { BillingClientsController } from './controllers/billing-clients.controller';
import { BillingSettingsController } from './controllers/billing-settings.controller';
import { InvoicePdfEmailController } from './controllers/invoice-pdf-email.controller';
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
    ]),
    EmailModule,
  ],
  controllers: [
    InvoicesController,
    InvoicePaymentsController,
    BillingClientsController,
    BillingSettingsController,
    InvoicePdfEmailController,
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
    RecurringInvoiceCron,
  ],
  exports: [InvoicesService, BillingClientsService],
})
export class AccountsBillingModule {}
