import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceEmailLog } from '../entities';
import { EmailService } from '../../email/email.service';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { SendInvoiceEmailDto } from '../dto';
import { MailStatus } from '../enums';
import { randomUUID } from 'node:crypto';
import { InvoiceDeliveryService } from './invoice-delivery.service';

@Injectable()
export class InvoiceEmailService {
  private readonly log = new Logger(InvoiceEmailService.name);

  constructor(
    @InjectRepository(InvoiceEmailLog)
    private readonly emailLogRepo: Repository<InvoiceEmailLog>,
    private readonly emailService: EmailService,
    private readonly invoicesService: InvoicesService,
    private readonly pdfService: InvoicePdfService,
    private readonly config: ConfigService,
    private readonly deliveries: InvoiceDeliveryService,
  ) {}

  async sendInvoice(
    invoiceId: string,
    dto: SendInvoiceEmailDto,
    userId: string,
  ) {
    const requestId = dto.requestId || randomUUID();
    const fingerprint = this.deliveries.fingerprint(dto);
    const existing = await this.deliveries.existing(
      invoiceId,
      requestId,
      fingerprint,
    );
    if (existing) return this.deliveries.result(existing);
    const { job, claimed } = await this.deliveries.begin(
      invoiceId,
      requestId,
      fingerprint,
      {
        invoiceId,
        toEmail: dto.toEmail,
        ccEmail: dto.ccEmail,
        bccEmail: dto.bccEmail,
        subject: dto.subject || 'Preparing invoice email',
        body: dto.body || '',
        sentStatus: MailStatus.NOT_SENT,
        sentBy: userId,
      },
    );
    if (!claimed) return this.deliveries.result(job);
    // Build the email from the same snapshot as its attachment, even if edited
    // while the PDF is rendering. Generation already persists the PDF once.
    let prepared: Awaited<ReturnType<InvoicePdfService['generatePdfBuffer']>>;
    try {
      prepared = await this.pdfService.generatePdfBuffer(invoiceId);
    } catch (error) {
      await this.markPreparationFailed(job.id);
      throw error;
    }
    const {
      buffer: pdfBuffer,
      fileName: pdfFileName,
      invoice,
      pdfPath,
    } = prepared;

    const references = [
      invoice.proformaReferenceNumber
        ? `Proforma ${invoice.proformaReferenceNumber}`
        : '',
      invoice.purchaseOrderNumber ? `PO ${invoice.purchaseOrderNumber}` : '',
    ].filter(Boolean);
    const subject =
      dto.subject ||
      `Invoice ${invoice.invoiceNumber}${
        references.length ? ` | ${references.join(' | ')}` : ''
      } from StatCo Solutions`;
    const body =
      dto.body ||
      `Dear ${invoice.billingClient?.contactPerson || 'Sir/Madam'},\n\nPlease find attached invoice ${invoice.invoiceNumber} dated ${invoice.invoiceDate}.\n\nAmount: ₹${invoice.grandTotal}${invoice.dueDate ? `\nDue Date: ${invoice.dueDate}` : ''}\n\nRegards,\nStatCo Solutions`;

    try {
      await this.deliveries.start(job, pdfPath, subject, body);
    } catch (error) {
      await this.markPreparationFailed(job.id);
      throw error;
    }

    let result: Awaited<ReturnType<EmailService['send']>>;
    try {
      result = await this.emailService.send(
        dto.toEmail,
        subject,
        `Invoice ${invoice.invoiceNumber}`,
        `<p>${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`,
        {
          name: this.config.get<string>(
            'INVOICE_FROM_NAME',
            'StatCo Solutions',
          ),
          email: this.config.get<string>(
            'INVOICE_FROM_EMAIL',
            'finance@statcosol.com',
          ),
        },
        {
          cc: dto.ccEmail || undefined,
          bcc: dto.bccEmail || undefined,
          attachments: [
            {
              filename: pdfFileName,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ],
        },
      );
    } catch {
      await this.markUncertain(job.id);
      return this.deliveries.result({ ...job, status: 'UNKNOWN' });
    }

    if (!('ok' in result) || !result.ok) {
      const skipped = 'skipped' in result && result.skipped;
      await this.markUncertain(job.id, !!skipped);
      return this.deliveries.result({
        ...job,
        status: skipped ? 'NOT_SENT' : 'UNKNOWN',
      });
    }
    try {
      await this.deliveries.accepted(job.id, result.messageId);
      return { success: true as const, messageId: result.messageId };
    } catch {
      this.log.error({
        event: 'INVOICE_DELIVERY_RECONCILIATION_PENDING',
        deliveryId: job.id,
      });
      return {
        success: true as const,
        messageId: result.messageId,
        statusUpdatePending: true,
        warning:
          'The mail server accepted this email, but its saved status needs reconciliation. Do not resend; review Email Logs with an administrator.',
      };
    }
  }

  private async markPreparationFailed(id: string) {
    try {
      await this.deliveries.preparationFailed(id);
    } catch {
      this.log.error({
        event: 'INVOICE_PREPARATION_STATUS_PENDING',
        deliveryId: id,
      });
    }
  }

  private async markUncertain(id: string, skipped = false) {
    try {
      await this.deliveries.uncertain(id, skipped);
    } catch {
      this.log.error({
        event: 'INVOICE_DELIVERY_OUTCOME_PENDING',
        deliveryId: id,
      });
    }
  }

  async findLogs(query: { invoiceId?: string; page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 25, 100);

    const qb = this.emailLogRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.invoice', 'inv')
      .leftJoinAndMapOne(
        'log.pendingPayment',
        'pending_payment_followups',
        'pp',
        'pp.id = log.pending_payment_id',
      )
      .orderBy('log.createdAt', 'DESC');

    if (query.invoiceId) {
      qb.andWhere('log.invoice_id = :invoiceId', {
        invoiceId: query.invoiceId,
      });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const deliveries = new Map(
      (await this.deliveries.details(data.map((row) => row.id))).map(
        (row: any) => [row.id, row],
      ),
    );
    return {
      data: data.map((row) => ({
        ...row,
        delivery: deliveries.get(row.id) || null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
