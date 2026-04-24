import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, FindOptionsWhere } from 'typeorm';
import { SlaTaskEntity } from './entities/sla-task.entity';
import { ReqUser } from '../access/access-scope.service';

@Injectable()
export class SlaService {
  constructor(
    @InjectRepository(SlaTaskEntity)
    private readonly repo: Repository<SlaTaskEntity>,
  ) {}

  async list(
    clientId: string,
    user: ReqUser,
    q: { status?: string; module?: string; branchId?: string },
  ): Promise<{ items: SlaTaskEntity[] }> {
    const where: FindOptionsWhere<SlaTaskEntity> = {
      clientId,
      deletedAt: IsNull(),
    };

    if (q.status) where.status = q.status;
    if (q.module) where.module = q.module;
    if (q.branchId) where.branchId = q.branchId;

    // Branch user can only view own branch
    const roleCode: string = user.roleCode;
    if (roleCode === 'CLIENT') {
      const mapped: string[] = user.branchIds ?? [];
      if (mapped.length > 0) {
        // Branch-scoped user — lock to first mapped branch
        const bid = mapped[0];
        where.branchId = bid;
      }
    }

    const rows = await this.repo.find({
      where,
      order: { dueDate: 'ASC' },
    });

    // Mark overdue dynamically
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const r of rows) {
      if (r.status !== 'CLOSED' && new Date(r.dueDate) < today) {
        r.status = 'OVERDUE';
      }
    }

    return { items: rows };
  }

  /** List ALL SLA tasks across all clients (admin view) */
  async listAll(
    _user: ReqUser,
    q: { status?: string; module?: string; branchId?: string },
  ): Promise<{ items: SlaTaskEntity[] }> {
    const where: FindOptionsWhere<SlaTaskEntity> = { deletedAt: IsNull() };
    if (q.status) where.status = q.status;
    if (q.module) where.module = q.module;
    if (q.branchId) where.branchId = q.branchId;

    const rows = await this.repo.find({
      where,
      order: { dueDate: 'ASC' },
      take: 200,
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const r of rows) {
      if (r.status !== 'CLOSED' && new Date(r.dueDate) < today) {
        r.status = 'OVERDUE';
      }
    }

    return { items: rows };
  }

  async update(
    clientId: string,
    user: ReqUser,
    id: string,
    body: { status?: string; assignedToUserId?: string; dueDate?: string },
  ): Promise<SlaTaskEntity> {
    const row = await this.repo.findOne({
      where: { id, clientId, deletedAt: IsNull() },
    });
    if (!row) throw new NotFoundException('SLA task not found');

    // Branch user restriction
    const roleCode: string = user.roleCode;
    if (roleCode === 'CLIENT') {
      const mapped: string[] = user.branchIds ?? [];
      if (mapped.length > 0 && row.branchId && !mapped.includes(row.branchId)) {
        throw new ForbiddenException('Branch not accessible');
      }
    }

    if (body.status) row.status = body.status;
    if (body.assignedToUserId !== undefined)
      row.assignedToUserId = body.assignedToUserId;
    if (body.dueDate) row.dueDate = body.dueDate;

    if (row.status === 'CLOSED') row.closedAt = new Date();

    row.updatedAt = new Date();
    return this.repo.save(row);
  }
}
