import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { EscalationEntity } from './entities/escalation.entity';
import { ReqUser } from '../access/access-scope.service';

@Injectable()
export class EscalationsService {
  constructor(
    @InjectRepository(EscalationEntity)
    private readonly repo: Repository<EscalationEntity>,
  ) {}

  async list(
    clientId: string,
    user: ReqUser,
    q: { status?: string; branchId?: string },
  ): Promise<{ items: EscalationEntity[] }> {
    const where: FindOptionsWhere<EscalationEntity> = { clientId };

    if (q.status) where.status = q.status;
    if (q.branchId) where.branchId = q.branchId;

    // Branch user can only view own branch
    const roleCode: string = user.roleCode;
    if (roleCode === 'CLIENT') {
      const mapped: string[] = user.branchIds ?? [];
      if (mapped.length > 0) {
        where.branchId = mapped[0];
      }
    }

    const rows = await this.repo.find({
      where,
      order: { createdAt: 'DESC' },
    });

    return { items: rows };
  }

  /** List ALL escalations across all clients (admin view) */
  async listAll(
    _user: ReqUser,
    q: { status?: string; branchId?: string },
  ): Promise<{ items: EscalationEntity[] }> {
    const where: FindOptionsWhere<EscalationEntity> = {};
    if (q.status) where.status = q.status;
    if (q.branchId) where.branchId = q.branchId;

    const rows = await this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 200, // limit for admin all-client view
    });

    return { items: rows };
  }

  async update(
    clientId: string,
    user: ReqUser,
    id: string,
    body: { status?: string },
  ): Promise<EscalationEntity> {
    const row = await this.repo.findOne({ where: { id, clientId } });
    if (!row) throw new NotFoundException('Escalation not found');

    // Branch user restriction
    const roleCode: string = user.roleCode;
    if (roleCode === 'CLIENT') {
      const mapped: string[] = user.branchIds ?? [];
      if (mapped.length > 0 && !mapped.includes(row.branchId)) {
        throw new ForbiddenException('Branch not accessible');
      }
    }

    if (body.status) {
      row.status = body.status;
      row.updatedAt = new Date();
    }

    return this.repo.save(row);
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
