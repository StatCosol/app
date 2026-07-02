import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecurringInvoiceConfig, BillingClient } from '../entities';
import {
  CreateRecurringInvoiceConfigDto,
  UpdateRecurringInvoiceConfigDto,
} from '../dto';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';

@Injectable()
export class RecurringInvoicesService {
  constructor(
    @InjectRepository(RecurringInvoiceConfig)
    private readonly repo: Repository<RecurringInvoiceConfig>,
    @InjectRepository(BillingClient)
    private readonly clientRepo: Repository<BillingClient>,
    private readonly auditLogs: AuditLogsService,
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
      if (isNaN(nrd.getTime()))
        throw new BadRequestException('Invalid nextRunDate');
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
    const saved = await this.repo.save(cfg);
    await this.auditLogs.log({
      entityType: 'RECURRING_INVOICE',
      entityId: saved.id,
      action: 'CREATE',
      performedBy: userId,
      afterJson: saved as unknown as Record<string, unknown>,
    });
    return saved;
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

  async update(
    id: string,
    dto: UpdateRecurringInvoiceConfigDto,
    userId?: string,
  ) {
    const cfg = await this.findOne(id);
    const before = { ...cfg } as unknown as Record<string, unknown>;
    // Only enforce "nextRunDate not in the past" when it's actually being
    // changed to a different value. Editing other fields on an existing config
    // whose nextRunDate is already in the past must remain allowed.
    const nextRunChanged =
      dto.nextRunDate !== undefined && dto.nextRunDate !== cfg.nextRunDate;
    this.validateDates(
      dto.startDate ?? cfg.startDate,
      dto.endDate ?? cfg.endDate,
      nextRunChanged ? dto.nextRunDate : undefined,
    );
    Object.assign(cfg, dto);
    const saved = await this.repo.save(cfg);
    await this.auditLogs.log({
      entityType: 'RECURRING_INVOICE',
      entityId: id,
      action: 'UPDATE',
      performedBy: userId ?? null,
      beforeJson: before,
      afterJson: saved as unknown as Record<string, unknown>,
    });
    return saved;
  }

  async remove(id: string, userId?: string) {
    const cfg = await this.findOne(id);
    const before = { ...cfg } as unknown as Record<string, unknown>;
    await this.repo.remove(cfg);
    await this.auditLogs.log({
      entityType: 'RECURRING_INVOICE',
      entityId: id,
      action: 'SOFT_DELETE',
      performedBy: userId ?? null,
      beforeJson: before,
    });
    return { success: true };
  }

  async toggleActive(id: string, isActive: boolean, userId?: string) {
    const cfg = await this.findOne(id);
    const previous = cfg.isActive;
    cfg.isActive = isActive;
    const saved = await this.repo.save(cfg);
    await this.auditLogs.log({
      entityType: 'RECURRING_INVOICE',
      entityId: id,
      action: 'STATUS_CHANGE',
      performedBy: userId ?? null,
      beforeJson: { isActive: previous },
      afterJson: { isActive: saved.isActive },
    });
    return saved;
  }
}
