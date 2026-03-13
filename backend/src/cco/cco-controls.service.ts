import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CcoSlaRuleEntity } from './entities/cco-sla-rule.entity';
import { CcoEscalationThresholdEntity } from './entities/cco-escalation-threshold.entity';
import { CcoReminderRuleEntity } from './entities/cco-reminder-rule.entity';
import {
  SaveSlaRuleDto,
  SaveEscalationThresholdDto,
  SaveReminderRuleDto,
} from './dto/cco-controls.dto';

@Injectable()
export class CcoControlsService {
  constructor(
    @InjectRepository(CcoSlaRuleEntity)
    private slaRepo: Repository<CcoSlaRuleEntity>,
    @InjectRepository(CcoEscalationThresholdEntity)
    private thresholdRepo: Repository<CcoEscalationThresholdEntity>,
    @InjectRepository(CcoReminderRuleEntity)
    private reminderRepo: Repository<CcoReminderRuleEntity>,
  ) {}

  /** Return all three rule sets in a single payload */
  async getAll() {
    const [slaRules, thresholds, reminders] = await Promise.all([
      this.slaRepo.find({ order: { createdAt: 'ASC' } }),
      this.thresholdRepo.find({ order: { createdAt: 'ASC' } }),
      this.reminderRepo.find({ order: { createdAt: 'ASC' } }),
    ]);
    return { slaRules, thresholds, reminders };
  }

  // ── SLA Rules ──

  async saveSla(dto: SaveSlaRuleDto) {
    if (dto.id) {
      await this.slaRepo.update(dto.id, {
        scope: dto.scope,
        priority: dto.priority,
        targetHours: dto.targetHours,
        escalationLevel1Hours: dto.escalationLevel1Hours,
        escalationLevel2Hours: dto.escalationLevel2Hours,
        isActive: dto.isActive ?? true,
      });
      return this.slaRepo.findOneByOrFail({ id: dto.id });
    }
    return this.slaRepo.save(
      this.slaRepo.create(dto as Partial<CcoSlaRuleEntity>),
    );
  }

  async toggleSla(id: string, isActive: boolean) {
    await this.slaRepo.update(id, { isActive });
    return { id, isActive };
  }

  // ── Escalation Thresholds ──

  async saveThreshold(dto: SaveEscalationThresholdDto) {
    if (dto.id) {
      await this.thresholdRepo.update(dto.id, {
        type: dto.type,
        value: dto.value,
        windowDays: dto.windowDays,
        severity: dto.severity,
        isActive: dto.isActive ?? true,
      });
      return this.thresholdRepo.findOneByOrFail({ id: dto.id });
    }
    return this.thresholdRepo.save(
      this.thresholdRepo.create(dto as Partial<CcoEscalationThresholdEntity>),
    );
  }

  async toggleThreshold(id: string, isActive: boolean) {
    await this.thresholdRepo.update(id, { isActive });
    return { id, isActive };
  }

  // ── Reminder Rules ──

  async saveReminder(dto: SaveReminderRuleDto) {
    if (dto.id) {
      await this.reminderRepo.update(dto.id, {
        scope: dto.scope,
        daysBeforeDue: dto.daysBeforeDue,
        notifyRoles: dto.notifyRoles,
        isActive: dto.isActive ?? true,
      });
      return this.reminderRepo.findOneByOrFail({ id: dto.id });
    }
    return this.reminderRepo.save(
      this.reminderRepo.create(dto as Partial<CcoReminderRuleEntity>),
    );
  }

  async toggleReminder(id: string, isActive: boolean) {
    await this.reminderRepo.update(id, { isActive });
    return { id, isActive };
  }
}
