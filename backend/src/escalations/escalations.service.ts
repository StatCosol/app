import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EscalationEntity } from './entities/escalation.entity';
import { ReqUser } from '../access/access-scope.service';
import { OperationalScopeService } from '../access/operational-scope.service';
@Injectable()
export class EscalationsService {
  constructor(
    @InjectRepository(EscalationEntity)
    private readonly repo: Repository<EscalationEntity>,
    private readonly scope: OperationalScopeService,
  ) {}
  async list(
    clientId: string,
    user: ReqUser,
    q: { status?: string; branchId?: string },
  ) {
    return this.read(user, q, clientId);
  }
  async listAll(user: ReqUser, q: { status?: string; branchId?: string }) {
    return this.read(user, q);
  }
  private async read(
    user: ReqUser,
    q: { status?: string; branchId?: string },
    clientId?: string,
  ) {
    const where = await this.scope.where<EscalationEntity>(
      user,
      clientId,
      q.branchId,
    );
    if (q.status) {
      if (!['OPEN', 'ACK', 'CLOSED'].includes(q.status))
        throw new BadRequestException('Invalid escalation status');
      where.status = q.status;
    }
    return {
      items: await this.repo.find({
        where,
        order: { createdAt: 'DESC', id: 'DESC' },
      }),
    };
  }
  async update(
    clientId: string,
    user: ReqUser,
    id: string,
    body: { status?: string },
  ): Promise<EscalationEntity> {
    return this.repo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(EscalationEntity);
      const row = await repo.findOne({
        lock: { mode: 'pessimistic_write' },
        where: { id, clientId },
      });
      if (!row) throw new NotFoundException('Escalation not found');
      await this.scope.assertRecord(user, row);
      if (
        body.status === undefined ||
        !['OPEN', 'ACK', 'CLOSED'].includes(body.status)
      )
        throw new BadRequestException('Use OPEN, ACK or CLOSED');
      const changes = { status: body.status, updatedAt: new Date() };
      await repo.update({ id: row.id }, changes);
      return Object.assign(row, changes);
    });
  }

  /* ─── System Escalations (cron / auto-generated) ─── */

  /**
   * Create a system escalation with dedup via source_key.
   * Returns existing record if already created (idempotent).
   */
  async createSystemEscalation(input: {
    clientId: string;
    sourceKey: string;
    branchId: string;
    reason: string;
    riskScore: number;
    slaOverdueCount?: number;
  }): Promise<EscalationEntity> {
    const existing = await this.repo.findOne({
      where: { clientId: input.clientId, sourceKey: input.sourceKey },
    });
    if (existing) return existing;

    const entity = this.repo.create({
      clientId: input.clientId,
      branchId: input.branchId,
      reason: input.reason,
      riskScore: input.riskScore,
      slaOverdueCount: input.slaOverdueCount ?? 0,
      status: 'OPEN',
      sourceKey: input.sourceKey,
    } as Partial<EscalationEntity>);

    return this.repo.save(entity);
  }
}
