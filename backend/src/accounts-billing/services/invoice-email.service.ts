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
  ) {}

  async sendInvoice(
    invoiceId: string,
    dto: SendInvoiceEmailDto,
    userId: string,
  ) {
    // Build the email from the same snapshot as its attachment, even if edited
    // while the PDF is rendering. Generation already persists the PDF once.
    const {
      buffer: pdfBuffer,
      fileName: pdfFileName,
      invoice,
    } = await this.pdfService.generatePdfBuffer(invoiceId);

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

    const log = this.emailLogRepo.create({
      invoiceId,
      toEmail: dto.toEmail,
      ccEmail: dto.ccEmail,
      bccEmail: dto.bccEmail,
      subject,
      body,
      sentStatus: MailStatus.NOT_SENT,
      sentBy: userId,
    });
    await this.emailLogRepo.save(log);

    try {
      const result = await this.emailService.send(
        dto.toEmail,
        subject,
        `Invoice ${invoice.invoiceNumber}`,
        `<p>${body.replace(/\n/g, '<br>')}</p>`,
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

      if ('ok' in result && result.ok) {
        log.sentStatus = MailStatus.SENT;
        log.sentAt = new Date();
        // SMTP acceptance cannot be undone by a bookkeeping failure. In
        // particular, never overwrite SENT with FAILED or retry delivery here.
        let statusUpdatePending = false;
        try {
          await this.emailLogRepo.save(log);
        } catch {
          statusUpdatePending = true;
          this.log.error(
            `Invoice ${invoiceId}: email accepted, email log update failed; reconcile before resending`,
          );
        }
        try {
          await this.invoicesService.updateMailStatus(
            invoiceId,
            MailStatus.SENT,
          );
        } catch {
          statusUpdatePending = true;
          this.log.error(
            `Invoice ${invoiceId}: email accepted, invoice status update failed; reconcile before resending`,
          );
        }
        return {
          success: true,
          messageId: result.messageId,
          ...(statusUpdatePending
            ? {
                statusUpdatePending: true,
                warning:
                  'The mail server accepted this email, but its saved status could not be fully updated. Do not resend; ask an administrator to reconcile the email log.',
              }
            : {}),
        };
      } else {
        const errMsg = 'error' in result ? String(result.error) : 'skipped';
        log.sentStatus = MailStatus.FAILED;
        log.failureReason = errMsg;
        await this.emailLogRepo.save(log);
        return { success: false, error: errMsg };
      }
    } catch (err) {
      log.sentStatus = MailStatus.FAILED;
      log.failureReason = (err as Error).message;
      await this.emailLogRepo.save(log);
      throw err;
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

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
