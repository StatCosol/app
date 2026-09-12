import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  IsNull,
  FindOptionsWhere,
  In,
  LessThan,
  MoreThanOrEqual,
} from 'typeorm';
import { SlaTaskEntity } from './entities/sla-task.entity';
import { ReqUser } from '../access/access-scope.service';
import { OperationalScopeService } from '../access/operational-scope.service';
import { operationalDate, validCalendarDate } from '../common/operational-date';

type Filters = { status?: string; module?: string; branchId?: string };
@Injectable()
export class SlaService {
  constructor(
    @InjectRepository(SlaTaskEntity)
    private readonly repo: Repository<SlaTaskEntity>,
    private readonly scope: OperationalScopeService,
  ) {}

  async list(
    clientId: string,
    user: ReqUser,
    q: Filters,
  ): Promise<{ items: SlaTaskEntity[] }> {
    return this.read(user, q, clientId);
  }
  async listAll(
    user: ReqUser,
    q: Filters,
  ): Promise<{ items: SlaTaskEntity[] }> {
    return this.read(user, q);
  }
  private async read(user: ReqUser, q: Filters, clientId?: string) {
    const today = operationalDate();
    const where: FindOptionsWhere<SlaTaskEntity> = {
      ...(await this.scope.where<SlaTaskEntity>(user, clientId, q.branchId)),
      deletedAt: IsNull(),
    };
    if (q.module) where.module = q.module;
    if (q.status) {
      if (!['OPEN', 'IN_PROGRESS', 'CLOSED', 'OVERDUE'].includes(q.status))
        throw new BadRequestException('Invalid SLA status');
      if (q.status === 'OVERDUE') {
        where.status = In(['OPEN', 'IN_PROGRESS', 'OVERDUE']);
        where.dueDate = LessThan(today);
      } else if (q.status === 'CLOSED') where.status = 'CLOSED';
      else {
        where.status = q.status === 'OPEN' ? In(['OPEN', 'OVERDUE']) : q.status;
        where.dueDate = MoreThanOrEqual(today);
      }
    }
    const rows = await this.repo.find({
      where,
      order: { dueDate: 'ASC', id: 'ASC' },
    });
    return {
      items: rows.map((row) => ({
        ...row,
        status:
          row.status !== 'CLOSED' && row.dueDate < today
            ? 'OVERDUE'
            : row.status === 'OVERDUE'
              ? 'OPEN'
              : row.status,
      })),
    };
  }
  async update(
    clientId: string | null,
    user: ReqUser,
    id: string,
    body: { status?: string; assignedToUserId?: string; dueDate?: string },
  ): Promise<SlaTaskEntity> {
    return this.repo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(SlaTaskEntity);
      const row = await repo.findOne({
        lock: { mode: 'pessimistic_write' },
        where: { id, ...(clientId ? { clientId } : {}), deletedAt: IsNull() },
      });
      if (!row) throw new NotFoundException('SLA task not found');
      await this.scope.assertRecord(user, row);
      if (
        body.status !== undefined &&
        !['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(body.status)
      )
        throw new BadRequestException(
          'Use OPEN, IN_PROGRESS or CLOSED; overdue status is calculated from the due date',
        );
      if (body.dueDate !== undefined && !validCalendarDate(body.dueDate))
        throw new BadRequestException(
          'dueDate must be a valid YYYY-MM-DD date',
        );
      if (
        (body.dueDate !== undefined || body.assignedToUserId !== undefined) &&
        !['ADMIN', 'CRM', 'CCO', 'CEO'].includes(user.roleCode)
      )
        throw new ForbiddenException(
          'Only operations managers can change task ownership or deadlines',
        );
      const changes: Partial<SlaTaskEntity> = { updatedAt: new Date() };
      if (body.status !== undefined) {
        changes.status = body.status;
        changes.closedAt =
          body.status === 'CLOSED' ? row.closedAt || new Date() : null;
      }
      if (body.dueDate !== undefined) changes.dueDate = body.dueDate;
      if (body.assignedToUserId !== undefined)
        changes.assignedToUserId = body.assignedToUserId;
      await repo.update({ id: row.id }, changes);
      return Object.assign(row, changes);
    });
  }
}
