import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingSetting } from '../entities';
import { UpdateBillingSettingsDto } from '../dto';
import { normalizeInvoicePrefix } from '../utils/invoice-number.util';

@Injectable()
export class BillingSettingsService {
  constructor(
    @InjectRepository(BillingSetting)
    private readonly repo: Repository<BillingSetting>,
  ) {}

  async getSettings() {
    let settings = await this.repo.findOne({ where: {} });
    if (!settings) {
      // Lazily seed an empty settings row the first time the page is opened
      // so the frontend always has something editable to render.
      settings = this.repo.create({
        tenantId: '00000000-0000-0000-0000-000000000000',
        legalName: 'StatCo Solutions',
        gstin: '',
        pan: '',
        address: '',
        stateCode: '36',
        stateName: 'Telangana',
        branchName: 'Dolapeta',
      } as Partial<BillingSetting>);
      settings = await this.repo.save(settings);
    }
    return settings;
  }

  async updateSettings(dto: UpdateBillingSettingsDto) {
    this.validateInvoicePrefixes(dto);

    let settings: BillingSetting | null = await this.repo.findOne({
      where: {},
    });
    if (!settings) {
      settings = this.repo.create({
        tenantId: '00000000-0000-0000-0000-000000000000',
        ...dto,
      } as Partial<BillingSetting>);
    } else {
      Object.assign(settings, dto);
    }
    return this.repo.save(settings);
  }

  private validateInvoicePrefixes(dto: UpdateBillingSettingsDto): void {
    if (dto.invoicePrefix !== undefined) {
      normalizeInvoicePrefix(dto.invoicePrefix, 'Invoice prefix');
    }
    if (dto.proformaPrefix !== undefined) {
      normalizeInvoicePrefix(dto.proformaPrefix, 'Proforma prefix');
    }
    if (dto.creditNotePrefix !== undefined) {
      normalizeInvoicePrefix(dto.creditNotePrefix, 'Credit note prefix');
    }
  }
}
