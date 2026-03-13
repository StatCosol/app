import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollConfigAuditEntity } from './entities/payroll-config-audit.entity';

@Injectable()
export class PayrollConfigAuditService {
  constructor(
    @InjectRepository(PayrollConfigAuditEntity)
    private readonly repo: Repository<PayrollConfigAuditEntity>,
  ) {}

  async log(params: {
    clientId: string;
    userId: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    entityType: string;
    entityId?: string;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    description?: string;
  }) {
    const entry = this.repo.create({
      clientId: params.clientId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      oldValues: params.oldValues ?? null,
      newValues: params.newValues ?? null,
      description: params.description ?? null,
    });
    return this.repo.save(entry);
  }

  async getHistory(
    clientId: string,
    options?: { entityType?: string; limit?: number },
  ) {
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.client_id = :clientId', { clientId })
      .orderBy('a.created_at', 'DESC');

    if (options?.entityType) {
      qb.andWhere('a.entity_type = :et', { et: options.entityType });
    }
    qb.limit(options?.limit ?? 100);

    return qb.getMany();
  }
}
