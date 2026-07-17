import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Invoice,
  InvoiceItem,
  BillingClient,
  BillingSetting,
  InvoiceAuditLog,
} from '../entities';
import { InvoiceStatus, PaymentStatus, MailStatus } from '../enums';
import { CreateInvoiceDto, UpdateInvoiceDto } from '../dto';
import { BillingCalculationService } from './billing-calculation.service';
import { BillingNumberService } from './billing-number.service';

// Invoices can only be edited while they're still moving through the
// pre-payment workflow. Once money has been received or the invoice has
// been cancelled, its figures must stay fixed for audit/reporting integrity.
const EDITABLE_STATUSES = new Set<InvoiceStatus>([
  InvoiceStatus.DRAFT,
  InvoiceStatus.APPROVED,
  InvoiceStatus.GENERATED,
  InvoiceStatus.EMAILED,
  InvoiceStatus.OVERDUE,
]);

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
    @InjectRepository(InvoiceAuditLog)
    private readonly auditLogRepo: Repository<InvoiceAuditLog>,
    private readonly calcService: BillingCalculationService,
    private readonly numberService: BillingNumberService,
  ) {}

  async create(dto: CreateInvoiceDto, userId: string) {
    const client = await this.clientRepo.findOne({
      where: { id: dto.billingClientId },
    });
    if (!client) throw new NotFoundException('Billing client not found');

    const settings = await this.settingsRepo.findOne({ where: {} });
    const supplierStateCode = settings?.stateCode || '36';
    const clientStateCode = client.stateCode;
    const gstRate = client.defaultGstRate || settings?.defaultGstRate || 18;

    const intraState = this.calcService.isIntraState(
      supplierStateCode,
      clientStateCode,
    );

    const invoiceNumber = await this.numberService.generateInvoiceNumber(
      dto.invoiceType,
      dto.invoiceDate,
    );
    const financialYear = this.numberService.getFinancialYear(
      new Date(dto.invoiceDate),
    );

    const dueDate = dto.dueDate ? dto.dueDate : null;

    const itemResults = dto.items.map((item) => {
      // Reimbursement / pass-through line items (e.g. statutory / government
      // fees that we collect on the client's behalf) are not a supply by us
      // and therefore do not attract GST. Force the GST rate to 0 so the
      // line is added to subtotal but contributes nothing to taxable value.
      const isReimbursement = item.isReimbursement || false;
      const itemGstRate = isReimbursement ? 0 : (item.gstRate ?? gstRate);
      return {
        ...item,
        isReimbursement,
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
      qb.andWhere('inv.payment_status = :paymentStatus', {
        paymentStatus: query.paymentStatus,
      });
    }
    if (query.clientId) {
      qb.andWhere('inv.billing_client_id = :clientId', {
        clientId: query.clientId,
      });
    }
    if (query.search) {
      qb.andWhere(
        '(inv.invoice_number ILIKE :s OR client.legal_name ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.fromDate) {
      qb.andWhere('inv.invoice_date >= :fromDate', {
        fromDate: query.fromDate,
      });
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

  async update(id: string, dto: UpdateInvoiceDto, userId: string) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id },
      relations: ['billingClient', 'items'],
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (!EDITABLE_STATUSES.has(invoice.invoiceStatus)) {
      throw new BadRequestException(
        `Invoice cannot be edited once it is ${invoice.invoiceStatus}. ` +
          'Invoices with recorded payments or that are cancelled are locked for editing.',
      );
    }
    if (invoice.paymentStatus !== PaymentStatus.UNPAID) {
      throw new BadRequestException(
        'Invoice has recorded payments and cannot be edited. Reverse the payments first.',
      );
    }

    const client = dto.billingClientId
      ? await this.clientRepo.findOne({ where: { id: dto.billingClientId } })
      : invoice.billingClient;
    if (!client) throw new NotFoundException('Billing client not found');

    const settings = await this.settingsRepo.findOne({ where: {} });
    const supplierStateCode = settings?.stateCode || '36';
    const clientStateCode = client.stateCode;
    const gstRate = client.defaultGstRate || settings?.defaultGstRate || 18;

    const intraState = this.calcService.isIntraState(
      supplierStateCode,
      clientStateCode,
    );

    const invoiceDate = dto.invoiceDate || invoice.invoiceDate;
    const items = dto.items;

    const oldStatus = invoice.invoiceStatus;
    const before = {
      invoiceNumber: invoice.invoiceNumber,
      grandTotal: invoice.grandTotal,
      itemCount: invoice.items?.length || 0,
    };

    invoice.billingClientId = client.id;
    invoice.billingClient = client;
    invoice.invoiceType = dto.invoiceType ?? invoice.invoiceType;
    invoice.invoiceDate = invoiceDate;
    invoice.dueDate = dto.dueDate !== undefined ? dto.dueDate : invoice.dueDate;
    invoice.placeOfSupply =
      dto.placeOfSupply ?? invoice.placeOfSupply ?? client.placeOfSupply;
    invoice.stateCode = clientStateCode;
    invoice.gstin = client.gstin;
    invoice.remarks = dto.remarks !== undefined ? dto.remarks : invoice.remarks;
    invoice.financialYear = this.numberService.getFinancialYear(
      new Date(invoiceDate),
    );

    if (items && items.length) {
      const itemResults = items.map((item) => {
        // Reimbursement / pass-through line items (e.g. statutory / government
        // fees) never attract GST — force the rate to 0.
        const isReimbursement = item.isReimbursement || false;
        const itemGstRate = isReimbursement ? 0 : (item.gstRate ?? gstRate);
        return {
          ...item,
          isReimbursement,
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
      Object.assign(invoice, totals);

      // Replace the line items wholesale rather than trying to diff/merge —
      // simpler and avoids stale rows lingering when items are removed.
      if (invoice.items?.length) {
        await this.itemRepo.remove(invoice.items);
      }
      invoice.items = itemResults.map((r, idx) =>
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
      );
    }

    const saved = await this.invoiceRepo.save(invoice);

    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        invoiceId: id,
        action: 'EDIT',
        oldStatus,
        newStatus: saved.invoiceStatus,
        changedBy: userId,
        payload: {
          before,
          after: {
            invoiceNumber: saved.invoiceNumber,
            grandTotal: saved.grandTotal,
            itemCount: saved.items?.length || 0,
          },
        },
      }),
    );

    return this.findOne(id);
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
    if (invoice.invoiceStatus === InvoiceStatus.PARTIALLY_PAID) {
      throw new BadRequestException(
        'Cannot cancel an invoice with recorded payments. Reverse the payments first.',
      );
    }
    invoice.invoiceStatus = InvoiceStatus.CANCELLED;
    return this.invoiceRepo.save(invoice);
  }

  async updatePdfPath(id: string, pdfPath: string) {
    const invoice = await this.invoiceRepo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    // Status transitions to GENERATED only from DRAFT or APPROVED. Once an
    // invoice has been GENERATED, EMAILED, PARTIALLY_PAID, PAID, OVERDUE
    // or CANCELLED, regenerating / re-emailing / re-downloading the PDF
    // must not silently regress its workflow status.
    const allowGeneratedTransition =
      invoice.invoiceStatus === InvoiceStatus.DRAFT ||
      invoice.invoiceStatus === InvoiceStatus.APPROVED;

    const update: Partial<Invoice> = { pdfPath };
    if (allowGeneratedTransition) {
      update.invoiceStatus = InvoiceStatus.GENERATED;
    }
    await this.invoiceRepo.update(id, update);
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
        "COUNT(*) FILTER (WHERE inv.payment_status = 'UNPAID' OR inv.payment_status = 'PARTIALLY_PAID') as \"pendingPaymentCount\"",
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
      .andWhere('inv.invoice_status != :cancelled', {
        cancelled: InvoiceStatus.CANCELLED,
      })
      .orderBy('inv.invoice_date', 'ASC')
      .getRawMany();
  }

  private calculateDueDate(invoiceDate: string, days: number): string {
    const d = new Date(invoiceDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }
}
