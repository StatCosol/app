import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecurringInvoiceConfig, BillingClient } from '../entities';
import {
  CreateRecurringInvoiceConfigDto,
  UpdateRecurringInvoiceConfigDto,
} from '../dto';

@Injectable()
export class RecurringInvoicesService {
  constructor(
    @InjectRepository(RecurringInvoiceConfig)
    private readonly repo: Repository<RecurringInvoiceConfig>,
    @InjectRepository(BillingClient)
    private readonly clientRepo: Repository<BillingClient>,
  ) {}

  private validateDates(
    startDate?: string,
    endDate?: string,
    nextRunDate?: string,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (nextRunDate) {
      const nrd = new Date(nextRunDate);
      if (isNaN(nrd.getTime())) throw new BadRequestException('Invalid nextRunDate');
      if (nrd < today) {
        throw new BadRequestException('nextRunDate cannot be in the past');
      }
    }
    if (startDate && endDate) {
      if (new Date(endDate) < new Date(startDate)) {
        throw new BadRequestException('endDate cannot be before startDate');
      }
    }
  }

  async create(dto: CreateRecurringInvoiceConfigDto, userId: string) {
    this.validateDates(dto.startDate, dto.endDate, dto.nextRunDate);
    const client = await this.clientRepo.findOne({
      where: { id: dto.billingClientId },
    });
    if (!client) throw new NotFoundException('Billing client not found');
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
    this.validateDates(
      dto.startDate ?? cfg.startDate,
      dto.endDate ?? cfg.endDate,
      dto.nextRunDate,
    );
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
