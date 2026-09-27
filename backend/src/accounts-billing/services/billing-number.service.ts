import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Invoice } from '../entities';
import { InvoiceType } from '../enums';
import { BillingSetting } from '../entities';
import {
  buildInvoiceNumber,
  compactFinancialYear,
  normalizeInvoicePrefix,
} from '../utils/invoice-number.util';

@Injectable()
export class BillingNumberService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(BillingSetting)
    private readonly settingsRepo: Repository<BillingSetting>,
  ) {}

  getFinancialYear(date: Date): string {
    const month = date.getUTCMonth();
    const year = date.getUTCFullYear();
    if (month >= 3) {
      return `${year}-${String(year + 1).slice(2)}`;
    }
    return `${year - 1}-${String(year).slice(2)}`;
  }

  async getPrefix(
    invoiceType: InvoiceType,
    manager?: EntityManager,
  ): Promise<string> {
    const settingsRepo = manager
      ? manager.getRepository(BillingSetting)
      : this.settingsRepo;
    const settings = await settingsRepo.findOne({ where: {} });
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
    manager: EntityManager,
  ): Promise<string> {
    const date = new Date(invoiceDate);
    if (!manager?.queryRunner?.isTransactionActive) {
      throw new BadRequestException(
        'Invoice number allocation requires an active transaction',
      );
    }
    if (!Number.isFinite(date.getTime())) {
      throw new BadRequestException('Invalid invoice date');
    }
    const fy = this.getFinancialYear(date);
    const prefix = normalizeInvoicePrefix(
      await this.getPrefix(invoiceType, manager),
    );
    const fullPrefix = `${prefix}/${compactFinancialYear(fy)}/`;

    // Hold the series lock until the caller commits the invoice and its items.
    // Shared normalized prefixes must share a lock, regardless of invoice type.
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `billing-invoice:${fullPrefix}`,
    ]);
    const [row] = await manager.query(
      `SELECT COALESCE(MAX(CASE WHEN invoice_number ~ $1
        THEN split_part(invoice_number, '/', 3)::numeric END), 0)::text AS maximum
       FROM invoices WHERE invoice_number LIKE $2`,
      [`^${fullPrefix}[0-9]+$`, `${fullPrefix}%`],
    );
    const nextSeq = Number(row.maximum) + 1;

    return buildInvoiceNumber(prefix, fy, nextSeq);
  }
}
