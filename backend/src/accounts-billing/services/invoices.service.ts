import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceItem, BillingClient, BillingSetting } from '../entities';
import { InvoiceStatus, PaymentStatus, MailStatus } from '../enums';
import { CreateInvoiceDto } from '../dto';
import { BillingCalculationService } from './billing-calculation.service';
import { BillingNumberService } from './billing-number.service';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly itemRepo: Repository<InvoiceItem>,
    @InjectRepository(BillingClient)
    private readonly clientRepo: Repository<BillingClient>,
    @InjectRepository(BillingSetting)
    private readonly settingsRepo: Repository<BillingSetting>,
    private readonly calcService: BillingCalculationService,
    private readonly numberService: BillingNumberService,
  ) {}

  async create(dto: CreateInvoiceDto, userId: string) {
    const client = await this.clientRepo.findOne({ where: { id: dto.billingClientId } });
    if (!client) throw new NotFoundException('Billing client not found');

    const settings = await this.settingsRepo.findOne({ where: {} });
    const supplierStateCode = settings?.stateCode || '36';
    const clientStateCode = client.stateCode;
    const gstRate = client.defaultGstRate || settings?.defaultGstRate || 18;

    const intraState = this.calcService.isIntraState(supplierStateCode, clientStateCode);

    const invoiceNumber = await this.numberService.generateInvoiceNumber(
      dto.invoiceType,
      dto.invoiceDate,
    );
    const financialYear = this.numberService.getFinancialYear(new Date(dto.invoiceDate));

    const dueDate = dto.dueDate || this.calculateDueDate(dto.invoiceDate, client.paymentTermsDays || 30);

    const itemResults = dto.items.map((item) => {
      const itemGstRate = item.gstRate ?? gstRate;
      return {
        ...item,
        gstRate: itemGstRate,
        ...this.calcService.calculateItem({
          quantity: item.quantity,
          rate: item.rate,
          discountAmount: item.discountAmount,
          gstRate: itemGstRate,
        }),
      };
    });

    const totals = this.calcService.calculateInvoiceTotals(
      itemResults.map((r) => ({
        amount: r.amount,
        discountAmount: r.discountAmount,
        taxableAmount: r.taxableAmount,
        gstAmount: r.gstAmount,
        lineTotal: r.lineTotal,
      })),
      gstRate,
      intraState,
    );

    const invoice = this.invoiceRepo.create({
      tenantId: client.tenantId,
      billingClientId: dto.billingClientId,
      invoiceType: dto.invoiceType,
      invoiceNumber,
      invoiceDate: dto.invoiceDate,
      dueDate,
      financialYear,
      placeOfSupply: dto.placeOfSupply || client.placeOfSupply,
      stateCode: clientStateCode,
      gstin: client.gstin,
      ...totals,
      invoiceStatus: InvoiceStatus.DRAFT,
      paymentStatus: PaymentStatus.UNPAID,
      mailStatus: MailStatus.NOT_SENT,
      remarks: dto.remarks,
      createdBy: userId,
      items: itemResults.map((r, idx) =>
        this.itemRepo.create({
          serviceCode: r.serviceCode,
          serviceDescription: r.serviceDescription,
          sacCode: r.sacCode || settings?.defaultSacCode,
          periodFrom: r.periodFrom,
          periodTo: r.periodTo,
          quantity: r.quantity,
          rate: r.rate,
          amount: r.amount,
          discountAmount: r.discountAmount,
          taxableAmount: r.taxableAmount,
          gstRate: r.gstRate,
          gstAmount: r.gstAmount,
          lineTotal: r.lineTotal,
          isReimbursement: r.isReimbursement || false,
          sequence: r.sequence || idx + 1,
        }),
      ),
    });

    return this.invoiceRepo.save(invoice);
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    status?: string;
    paymentStatus?: string;
    clientId?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 25, 100);

    const qb = this.invoiceRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.billingClient', 'client')
      .leftJoinAndSelect('inv.items', 'items')
      .orderBy('inv.createdAt', 'DESC');

    if (query.status) {
      qb.andWhere('inv.invoice_status = :status', { status: query.status });
    }
    if (query.paymentStatus) {
      qb.andWhere('inv.payment_status = :paymentStatus', { paymentStatus: query.paymentStatus });
    }
    if (query.clientId) {
      qb.andWhere('inv.billing_client_id = :clientId', { clientId: query.clientId });
    }
    if (query.search) {
      qb.andWhere(
        '(inv.invoice_number ILIKE :s OR client.legal_name ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.fromDate) {
      qb.andWhere('inv.invoice_date >= :fromDate', { fromDate: query.fromDate });
    }
    if (query.toDate) {
      qb.andWhere('inv.invoice_date <= :toDate', { toDate: query.toDate });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id },
      relations: ['billingClient', 'items', 'payments'],
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async approve(id: string, userId: string) {
    const invoice = await this.findOne(id);
    if (invoice.invoiceStatus !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT invoices can be approved');
    }
    invoice.invoiceStatus = InvoiceStatus.APPROVED;
    invoice.approvedBy = userId;
    invoice.approvedAt = new Date();
    return this.invoiceRepo.save(invoice);
  }

  async cancel(id: string) {
    const invoice = await this.findOne(id);
    if (invoice.invoiceStatus === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot cancel a fully paid invoice');
    }
    invoice.invoiceStatus = InvoiceStatus.CANCELLED;
    return this.invoiceRepo.save(invoice);
  }

  async updatePdfPath(id: string, pdfPath: string) {
    await this.invoiceRepo.update(id, { pdfPath, invoiceStatus: InvoiceStatus.GENERATED });
  }

  async updateMailStatus(id: string, mailStatus: MailStatus) {
    await this.invoiceRepo.update(id, { mailStatus });
  }

  async getDashboardStats() {
    const stats = await this.invoiceRepo
      .createQueryBuilder('inv')
      .select([
        'COUNT(*) as "totalInvoices"',
        'COUNT(*) FILTER (WHERE inv.invoice_status = \'DRAFT\') as "draftCount"',
        'COUNT(*) FILTER (WHERE inv.invoice_status = \'APPROVED\') as "approvedCount"',
        'COUNT(*) FILTER (WHERE inv.payment_status = \'UNPAID\' OR inv.payment_status = \'PARTIALLY_PAID\') as "pendingPaymentCount"',
        'COUNT(*) FILTER (WHERE inv.payment_status = \'PAID\') as "paidCount"',
        'COUNT(*) FILTER (WHERE inv.invoice_status = \'OVERDUE\') as "overdueCount"',
        'COALESCE(SUM(inv.grand_total), 0) as "totalBilled"',
        'COALESCE(SUM(inv.amount_received), 0) as "totalReceived"',
        'COALESCE(SUM(inv.balance_outstanding), 0) as "totalOutstanding"',
      ])
      .getRawOne();

    return stats;
  }

  async getGstSummary(fromDate: string, toDate: string) {
    return this.invoiceRepo
      .createQueryBuilder('inv')
      .leftJoin('inv.billingClient', 'client')
      .select([
        'inv.invoice_number as "invoiceNumber"',
        'inv.invoice_date as "invoiceDate"',
        'client.legal_name as "clientName"',
        'client.gstin as "clientGstin"',
        'inv.taxable_value as "taxableValue"',
        'inv.cgst_amount as "cgstAmount"',
        'inv.sgst_amount as "sgstAmount"',
        'inv.igst_amount as "igstAmount"',
        'inv.grand_total as "grandTotal"',
      ])
      .where('inv.invoice_date >= :fromDate', { fromDate })
      .andWhere('inv.invoice_date <= :toDate', { toDate })
      .andWhere('inv.invoice_status != :cancelled', { cancelled: InvoiceStatus.CANCELLED })
      .orderBy('inv.invoice_date', 'ASC')
      .getRawMany();
  }

  private calculateDueDate(invoiceDate: string, days: number): string {
    const d = new Date(invoiceDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }
}
