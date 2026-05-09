import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceNotificationCenterEntity } from '../entities/compliance-notification-center.entity';

@Injectable()
export class ComplianceNotificationCenterService {
  constructor(
    @InjectRepository(ComplianceNotificationCenterEntity)
    private readonly repo: Repository<ComplianceNotificationCenterEntity>,
  ) {}

  async getNotifications(role: string, clientId?: string, branchId?: string) {
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.role = :role', { role })
      .orderBy('n.createdAt', 'DESC');

    if (clientId) {
      qb.andWhere('n.clientId = :clientId', { clientId });
    }

    if (branchId) {
      qb.andWhere('(n.branchId = :branchId OR n.branchId IS NULL)', {
        branchId,
      });
    }

    return qb.getMany();
  }

  async markRead(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Notification not found');
    item.status = 'READ';
    return this.repo.save(item);
  }

  async createNotification(
    payload: Partial<ComplianceNotificationCenterEntity>,
  ) {
    const item = this.repo.create({
      status: 'OPEN',
      priority: 'MEDIUM',
      ...payload,
    });
    return this.repo.save(item);
  }

  async getBadge(role: string, clientId?: string, branchId?: string) {
    const items = await this.getNotifications(role, clientId, branchId);

    return {
      totalOpen: items.filter((i) => i.status === 'OPEN').length,
      critical: items.filter(
        (i) => i.status === 'OPEN' && i.priority === 'CRITICAL',
      ).length,
      high: items.filter((i) => i.status === 'OPEN' && i.priority === 'HIGH')
        .length,
    };
  }
}
