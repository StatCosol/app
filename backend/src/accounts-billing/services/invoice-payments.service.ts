import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
    private readonly dataSource: DataSource,
  ) {}

  async recordPayment(
    invoiceId: string,
    dto: RecordPaymentDto,
    userId: string,
  ) {
    // Defensive numeric checks (DTO validation enforces these too, but the
    // financial code path must never trust the inputs).
    const amountReceived = Number(dto.amountReceived);
    const tdsAmount = Number(dto.tdsAmount || 0);
    const otherDeduction = Number(dto.otherDeduction || 0);
    if (!(amountReceived > 0)) {
      throw new BadRequestException('amountReceived must be greater than zero');
    }
    if (tdsAmount < 0 || otherDeduction < 0) {
      throw new BadRequestException(
        'tdsAmount / otherDeduction cannot be negative',
      );
    }
    const netReceived = amountReceived - tdsAmount - otherDeduction;
    if (netReceived <= 0) {
      throw new BadRequestException(
        'Net received (amount minus deductions) must be positive',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      // Lock the invoice row so concurrent payment submissions cannot
      // overpay or race the running-balance update.
      const invoice = await manager
        .getRepository(Invoice)
        .createQueryBuilder('inv')
        .setLock('pessimistic_write')
        .where('inv.id = :id', { id: invoiceId })
        .getOne();
      if (!invoice) throw new NotFoundException('Invoice not found');

      if (invoice.invoiceStatus === InvoiceStatus.CANCELLED) {
        throw new BadRequestException(
          'Cannot record payment on a cancelled invoice',
        );
      }
      if (invoice.invoiceStatus === InvoiceStatus.DRAFT) {
        throw new BadRequestException(
          'Cannot record payment on a DRAFT invoice. Approve the invoice first.',
        );
      }

      const grandTotal = Number(invoice.grandTotal);
      const previouslyReceived = Number(invoice.amountReceived);
      // Receivable is cleared by the gross amount the customer paid
      // (cash + TDS + other agreed deductions). TDS is remitted to the
      // IT department against our PAN and is later claimed back, so it
      // settles the customer's outstanding even though it isn't cash in
      // hand. `amountReceived` therefore tracks gross-cleared, not net cash.
      const totalReceived = previouslyReceived + amountReceived;

      // Reject overpayment with a small tolerance for floating-point noise.
      if (totalReceived - grandTotal > 0.01) {
        throw new BadRequestException(
          `Payment exceeds invoice balance. Outstanding: ${(
            grandTotal - previouslyReceived
          ).toFixed(2)}`,
        );
      }

      const receiptNumber = await this.generateReceiptNumber(manager);
      const paymentRepo = manager.getRepository(InvoicePayment);

      const payment = paymentRepo.create({
        invoiceId,
        receiptNumber,
        paymentDate: dto.paymentDate,
        amountReceived,
        tdsAmount,
        otherDeduction,
        netReceived,
        paymentMode: dto.paymentMode,
        referenceNumber: dto.referenceNumber,
        bankName: dto.bankName,
        remarks: dto.remarks,
        createdBy: userId,
      });

      let savedPayment: InvoicePayment;
      try {
        savedPayment = await paymentRepo.save(payment);
      } catch (e) {
        const err = e as { code?: string; constraint?: string };
        if (
          err?.code === '23505' &&
          (err?.constraint?.includes('receipt_number') ?? true)
        ) {
          throw new ConflictException(
            'Duplicate receipt number generated. Please retry.',
          );
        }
        throw e as Error;
      }

      const balance = grandTotal - totalReceived;
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

      await manager.getRepository(Invoice).update(invoiceId, {
        amountReceived: totalReceived,
        balanceOutstanding: Math.max(balance, 0),
        paymentStatus,
        invoiceStatus,
      });

      return savedPayment;
    });
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

  private async generateReceiptNumber(
    manager?: import('typeorm').EntityManager,
  ): Promise<string> {
    const date = new Date();
    const fy =
      date.getMonth() >= 3
        ? `${date.getFullYear()}-${String(date.getFullYear() + 1).slice(2)}`
        : `${date.getFullYear() - 1}-${String(date.getFullYear()).slice(2)}`;

    const prefix = `STS/REC/${fy}/`;
    const repo = manager
      ? manager.getRepository(InvoicePayment)
      : this.paymentRepo;
    const last = await repo
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
