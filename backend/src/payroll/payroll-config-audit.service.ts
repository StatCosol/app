import { BadRequestException, Injectable } from '@nestjs/common';
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
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
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
    const limit = options?.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 500',
      );
    }
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.client_id = :clientId', { clientId })
      .orderBy('a.created_at', 'DESC');

    if (options?.entityType) {
      qb.andWhere('a.entity_type = :et', { et: options.entityType });
    }
    qb.limit(limit);

    return qb.getMany();
  }
}
