import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../entities';
import { InvoiceType } from '../enums';
import { BillingSetting } from '../entities';

@Injectable()
export class BillingNumberService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(BillingSetting)
    private readonly settingsRepo: Repository<BillingSetting>,
  ) {}

  getFinancialYear(date: Date): string {
    const month = date.getMonth();
    const year = date.getFullYear();
    if (month >= 3) {
      return `${year}-${String(year + 1).slice(2)}`;
    }
    return `${year - 1}-${String(year).slice(2)}`;
  }

  async getPrefix(invoiceType: InvoiceType): Promise<string> {
    const settings = await this.settingsRepo.findOne({ where: {} });
    switch (invoiceType) {
      case InvoiceType.TAX_INVOICE:
        return settings?.invoicePrefix || 'STS/INV';
      case InvoiceType.PROFORMA:
        return settings?.proformaPrefix || 'STS/PI';
      case InvoiceType.CREDIT_NOTE:
        return settings?.creditNotePrefix || 'STS/CN';
      default:
        return settings?.invoicePrefix || 'STS/INV';
    }
  }

  async generateInvoiceNumber(
    invoiceType: InvoiceType,
    invoiceDate: string,
  ): Promise<string> {
    const date = new Date(invoiceDate);
    const fy = this.getFinancialYear(date);
    const prefix = await this.getPrefix(invoiceType);
    const fullPrefix = `${prefix}/${fy}/`;

    const lastInvoice = await this.invoiceRepo
      .createQueryBuilder('inv')
      .where('inv.invoice_number LIKE :prefix', { prefix: `${fullPrefix}%` })
      .orderBy('inv.invoiceNumber', 'DESC')
      .getOne();

    let nextSeq = 1;
    if (lastInvoice) {
      const parts = lastInvoice.invoiceNumber.split('/');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextSeq = lastNum + 1;
    }

    return `${fullPrefix}${String(nextSeq).padStart(4, '0')}`;
  }
}
