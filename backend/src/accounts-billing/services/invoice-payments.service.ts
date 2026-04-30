import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoicePayment } from '../entities';
import { PaymentStatus, InvoiceStatus } from '../enums';
import { RecordPaymentDto } from '../dto';

@Injectable()
export class InvoicePaymentsService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoicePayment)
    private readonly paymentRepo: Repository<InvoicePayment>,
  ) {}

  async recordPayment(
    invoiceId: string,
    dto: RecordPaymentDto,
    userId: string,
  ) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (invoice.invoiceStatus === InvoiceStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot record payment on a cancelled invoice',
      );
    }

    const netReceived =
      dto.amountReceived - (dto.tdsAmount || 0) - (dto.otherDeduction || 0);
    const receiptNumber = await this.generateReceiptNumber();

    const payment = this.paymentRepo.create({
      invoiceId,
      receiptNumber,
      paymentDate: dto.paymentDate,
      amountReceived: dto.amountReceived,
      tdsAmount: dto.tdsAmount || 0,
      otherDeduction: dto.otherDeduction || 0,
      netReceived,
      paymentMode: dto.paymentMode,
      referenceNumber: dto.referenceNumber,
      bankName: dto.bankName,
      remarks: dto.remarks,
      createdBy: userId,
    });

    await this.paymentRepo.save(payment);

    const totalReceived = +invoice.amountReceived + netReceived;
    const balance = +invoice.grandTotal - totalReceived;

    const paymentStatus =
      balance <= 0
        ? PaymentStatus.PAID
        : totalReceived > 0
          ? PaymentStatus.PARTIALLY_PAID
          : PaymentStatus.UNPAID;

    const invoiceStatus =
      paymentStatus === PaymentStatus.PAID
        ? InvoiceStatus.PAID
        : paymentStatus === PaymentStatus.PARTIALLY_PAID
          ? InvoiceStatus.PARTIALLY_PAID
          : invoice.invoiceStatus;

    await this.invoiceRepo.update(invoiceId, {
      amountReceived: totalReceived,
      balanceOutstanding: Math.max(balance, 0),
      paymentStatus,
      invoiceStatus,
    });

    return payment;
  }

  async findByInvoice(invoiceId: string) {
    return this.paymentRepo.find({
      where: { invoiceId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(query: { page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 25, 100);

    const [data, total] = await this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.invoice', 'inv')
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private async generateReceiptNumber(): Promise<string> {
    const date = new Date();
    const fy =
      date.getMonth() >= 3
        ? `${date.getFullYear()}-${String(date.getFullYear() + 1).slice(2)}`
        : `${date.getFullYear() - 1}-${String(date.getFullYear()).slice(2)}`;

    const prefix = `STS/REC/${fy}/`;
    const last = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.receipt_number LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('p.receiptNumber', 'DESC')
      .getOne();

    let seq = 1;
    if (last) {
      const parts = last.receiptNumber.split('/');
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num)) seq = num + 1;
    }

    return `${prefix}${String(seq).padStart(4, '0')}`;
  }
}
