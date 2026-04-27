import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
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
  ) {}

  async sendInvoice(
    invoiceId: string,
    dto: SendInvoiceEmailDto,
    userId: string,
  ) {
    const invoice = await this.invoicesService.findOne(invoiceId);

    let pdfPath = invoice.pdfPath;
    if (!pdfPath) {
      pdfPath = await this.pdfService.generatePdf(invoiceId);
    }

    const subject =
      dto.subject || `Invoice ${invoice.invoiceNumber} from StatCo Solutions`;
    const body =
      dto.body ||
      `Dear ${invoice.billingClient?.contactPerson || 'Sir/Madam'},\n\nPlease find attached invoice ${invoice.invoiceNumber} dated ${invoice.invoiceDate}.\n\nAmount: ₹${invoice.grandTotal}\nDue Date: ${invoice.dueDate}\n\nRegards,\nStatCo Solutions`;

    const log = this.emailLogRepo.create({
      invoiceId,
      toEmail: dto.toEmail,
      ccEmail: dto.ccEmail,
      subject,
      body,
      sentStatus: MailStatus.NOT_SENT,
      sentBy: userId,
    });
    await this.emailLogRepo.save(log);

    try {
      const absolutePath = path.join(process.cwd(), pdfPath.replace(/^\//, ''));
      const result = await this.emailService.send(
        dto.toEmail,
        subject,
        `Invoice ${invoice.invoiceNumber}`,
        `<p>${body.replace(/\n/g, '<br>')}</p>`,
      );

      if ('ok' in result && result.ok) {
        log.sentStatus = MailStatus.SENT;
        log.sentAt = new Date();
        await this.emailLogRepo.save(log);
        await this.invoicesService.updateMailStatus(invoiceId, MailStatus.SENT);
        return { success: true, messageId: result.messageId };
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
      .orderBy('log.sentAt', 'DESC');

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
