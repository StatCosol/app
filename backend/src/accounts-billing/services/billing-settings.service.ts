import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingSetting } from '../entities';
import { UpdateBillingSettingsDto } from '../dto';

@Injectable()
export class BillingSettingsService {
  constructor(
    @InjectRepository(BillingSetting)
    private readonly repo: Repository<BillingSetting>,
  ) {}

  async getSettings() {
    const settings = await this.repo.findOne({ where: {} });
    if (!settings)
      throw new NotFoundException('Billing settings not configured');
    return settings;
  }

  async updateSettings(dto: UpdateBillingSettingsDto) {
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
}
