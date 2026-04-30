import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecurringInvoiceConfig } from '../entities';
import {
  CreateRecurringInvoiceConfigDto,
  UpdateRecurringInvoiceConfigDto,
} from '../dto';

@Injectable()
export class RecurringInvoicesService {
  constructor(
    @InjectRepository(RecurringInvoiceConfig)
    private readonly repo: Repository<RecurringInvoiceConfig>,
  ) {}

  async create(dto: CreateRecurringInvoiceConfigDto, userId: string) {
    const cfg = this.repo.create({
      ...dto,
      defaultGstRate: dto.defaultGstRate ?? 18,
      isActive: dto.isActive ?? true,
      createdBy: userId,
    });
    return this.repo.save(cfg);
  }

  async findAll() {
    return this.repo.find({
      relations: ['billingClient'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const cfg = await this.repo.findOne({
      where: { id },
      relations: ['billingClient'],
    });
    if (!cfg) throw new NotFoundException('Recurring config not found');
    return cfg;
  }

  async update(id: string, dto: UpdateRecurringInvoiceConfigDto) {
    const cfg = await this.findOne(id);
    Object.assign(cfg, dto);
    return this.repo.save(cfg);
  }

  async remove(id: string) {
    const cfg = await this.findOne(id);
    await this.repo.remove(cfg);
    return { success: true };
  }

  async toggleActive(id: string, isActive: boolean) {
    const cfg = await this.findOne(id);
    cfg.isActive = isActive;
    return this.repo.save(cfg);
  }
}
