import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { CreatePayrollQueryDto } from './dto/payroll-query.dto';
import { PayrollQueryEntity } from './entities/payroll-query.entity';
import { PayrollQueryMessageEntity } from './entities/payroll-query-message.entity';
import { PayrollClientScopeService } from './payroll-client-scope.service';

@Injectable()
export class PayrollQueryService {
  constructor(
    @InjectRepository(PayrollQueryEntity)
    private readonly queryRepo: Repository<PayrollQueryEntity>,
    @InjectRepository(PayrollQueryMessageEntity)
    private readonly queryMsgRepo: Repository<PayrollQueryMessageEntity>,
    private readonly scope: PayrollClientScopeService,
  ) {}

  async listQueries(user: ReqUser, q: Record<string, any>) {
    const clientIds = await this.scope.getAssignedClientIds(user);
    if (!clientIds.length) return { data: [], total: 0 };

    const qb = this.queryRepo
      .createQueryBuilder('pq')
      .leftJoin('clients', 'c', 'c.id = pq.client_id')
      .leftJoin('employees', 'e', 'e.id = pq.employee_id')
      .leftJoin('users', 'u', 'u.id = pq.raised_by')
      .select([
        'pq.id as "id"',
        'pq.subject as "subject"',
        'pq.category as "category"',
        'pq.priority as "priority"',
        'pq.status as "status"',
        'pq.created_at as "createdAt"',
        'pq.resolved_at as "resolvedAt"',
        'pq.client_id as "clientId"',
        'c.client_name as "clientName"',
        'pq.employee_id as "employeeId"',
        'e.name as "employeeName"',
        'u.name as "raisedByName"',
      ])
      .where('pq.client_id IN (:...ids)', { ids: clientIds });

    if (q?.status) qb.andWhere('pq.status = :st', { st: q.status });
    if (q?.clientId) qb.andWhere('pq.client_id = :cid', { cid: q.clientId });
    if (q?.priority) qb.andWhere('pq.priority = :pr', { pr: q.priority });
    if (q?.category) qb.andWhere('pq.category = :cat', { cat: q.category });
    if (q?.search) {
      qb.andWhere('(pq.subject ILIKE :s OR pq.description ILIKE :s)', {
        s: `%${q.search}%`,
      });
    }

    const total = await qb.getCount();
    qb.orderBy('pq.created_at', 'DESC');
    const page = Math.max(1, Number(q?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q?.limit) || 25));
    qb.skip((page - 1) * limit).take(limit);
    const data = await qb.getRawMany();
    return { data, total, page, limit };
  }

  async getQueryDetail(user: ReqUser, queryId: string) {
    const query = await this.queryRepo.findOne({ where: { id: queryId } });
    if (!query) throw new BadRequestException('Query not found');

    const clientIds = await this.scope.getAssignedClientIds(user);
    if (!clientIds.includes(query.clientId)) {
      throw new ForbiddenException('Query not in your assigned clients');
    }

    const messages = await this.queryMsgRepo.find({
      where: { queryId },
      order: { createdAt: 'ASC' },
    });

    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    let senderMap = new Map<string, string>();
    if (senderIds.length) {
      try {
        const rows = await this.queryRepo.manager
          .createQueryBuilder()
          .select(['u.id as id', 'u.name as name'])
          .from('users', 'u')
          .where('u.id IN (:...ids)', { ids: senderIds })
          .getRawMany();
        senderMap = new Map(
          rows.map((r: { id: string; name: string }) => [r.id, r.name]),
        );
      } catch {
        /* OK */
      }
    }

    return {
      ...query,
      messages: messages.map((m) => ({
        ...m,
        senderName: senderMap.get(m.senderId) || 'Unknown',
      })),
    };
  }

  async createQuery(user: ReqUser, dto: CreatePayrollQueryDto) {
    const clientIds = await this.scope.getAssignedClientIds(user);
    if (!dto.clientId || !clientIds.includes(dto.clientId)) {
      throw new ForbiddenException('Invalid client');
    }

    const query = this.queryRepo.create({
      clientId: dto.clientId,
      employeeId: dto.employeeId || null,
      raisedBy: user.id,
      assignedTo: dto.assignedTo || user.id,
      subject: dto.subject,
      category: dto.category || 'GENERAL',
      priority: dto.priority || 'MEDIUM',
      status: 'OPEN',
      description: dto.description || null,
    });
    const saved = await this.queryRepo.save(query);

    if (dto.description) {
      await this.queryMsgRepo.save(
        this.queryMsgRepo.create({
          queryId: saved.id,
          senderId: user.id,
          message: dto.description,
        }),
      );
    }

    return saved;
  }

  async addQueryMessage(user: ReqUser, queryId: string, message: string) {
    const query = await this.queryRepo.findOne({ where: { id: queryId } });
    if (!query) throw new BadRequestException('Query not found');

    const msg = await this.queryMsgRepo.save(
      this.queryMsgRepo.create({
        queryId,
        senderId: user.id,
        message,
      }),
    );

    await this.queryRepo.update(queryId, { updatedAt: new Date() });
    return msg;
  }

  async resolveQuery(user: ReqUser, queryId: string, resolution: string) {
    const query = await this.queryRepo.findOne({ where: { id: queryId } });
    if (!query) throw new BadRequestException('Query not found');

    await this.queryRepo.update(queryId, {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolvedBy: user.id,
      resolution,
    });

    await this.queryMsgRepo.save(
      this.queryMsgRepo.create({
        queryId,
        senderId: user.id,
        message: `[Resolved] ${resolution}`,
      }),
    );

    return { success: true };
  }

  async updateQueryStatus(_user: ReqUser, queryId: string, status: string) {
    const query = await this.queryRepo.findOne({ where: { id: queryId } });
    if (!query) throw new BadRequestException('Query not found');
    await this.queryRepo.update(queryId, { status });
    return { success: true };
  }
}
