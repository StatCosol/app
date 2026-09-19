import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceNotificationCenterEntity } from '../entities/compliance-notification-center.entity';
import { AccessScopeService, ReqUser } from '../../access/access-scope.service';

@Injectable()
export class ComplianceNotificationCenterService {
  constructor(
    @InjectRepository(ComplianceNotificationCenterEntity)
    private readonly repo: Repository<ComplianceNotificationCenterEntity>,
    private readonly access: AccessScopeService,
  ) {}

  /**
   * `clientIds`: null for a global role, otherwise the clients the caller may
   * see. An assigned role (CRM, PAYROLL, AUDITOR) that named no client used to
   * get every client's notifications for its role.
   */
  async getNotifications(
    role: string,
    clientId?: string,
    branchId?: string,
    clientIds: string[] | null = null,
  ) {
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.role = :role', { role })
      .orderBy('n.createdAt', 'DESC');

    if (clientId) {
      qb.andWhere('n.clientId = :clientId', { clientId });
    }

    if (clientIds) {
      if (!clientIds.length) return [];
      qb.andWhere('n.clientId IN (:...scopeClientIds)', {
        scopeClientIds: clientIds,
      });
    }

    if (branchId) {
      qb.andWhere('(n.branchId = :branchId OR n.branchId IS NULL)', {
        branchId,
      });
    }

    return qb.getMany();
  }

  /**
   * Only a notification addressed to the caller's role, in the caller's
   * clients. By id alone any user could mark any notification read.
   */
  async markRead(id: string, user: ReqUser) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Notification not found');
    const scope = await this.access.getScope(user);
    if (scope.level !== 'all') {
      if (item.role !== user.roleCode || !item.clientId)
        throw new NotFoundException('Notification not found');
      await this.access.assertClientAllowed(user, item.clientId);
    }
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

  async getBadge(
    role: string,
    clientId?: string,
    branchId?: string,
    clientIds: string[] | null = null,
  ) {
    const items = await this.getNotifications(
      role,
      clientId,
      branchId,
      clientIds,
    );

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
