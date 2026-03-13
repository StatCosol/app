import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { ScopedListQueryDto } from '../common/dto/scoped-list-query.dto';
import { Page } from '../common/types/page.type';
import {
  applySearch,
  applySort,
  paginate,
  SortConfig,
} from '../common/db/paginate-qb';
import { AuditEntity } from '../audits/entities/audit.entity';

@Injectable()
export class AuditListService {
  constructor(
    private readonly ds: DataSource,
    private readonly scope: AccessScopeService,
  ) {}

  private readonly searchFields = [
    'client.clientName',
    'branch.branchName',
    'a.auditCode',
  ];

  private readonly sortConfig: SortConfig = {
    sortMap: {
      updatedAt: 'a.updatedAt',
      status: 'a.status',
      score: 'a.score',
      branchName: 'branch.branchName',
      clientName: 'client.clientName',
    },
    defaultSort: 'a.updatedAt',
    defaultOrder: 'DESC',
  };

  async list(user: ReqUser, q: ScopedListQueryDto): Promise<Page<AuditEntity>> {
    const scopeResult = await this.scope.getScope(user);
    const qb = this.ds
      .getRepository(AuditEntity)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.client', 'client')
      .leftJoinAndSelect('a.branch', 'branch');

    this.scope.applyToQb(qb, scopeResult, {
      clientPath: 'a.clientId',
      branchPath: 'a.branchId',
    });

    const cid = this.scope.resolveClientId(user, q.clientId);
    if (cid) qb.andWhere('a.clientId = :cid', { cid });
    const bid = this.scope.resolveBranchId(user, q.branchId);
    if (bid) qb.andWhere('a.branchId = :bid', { bid });

    if (q.status) qb.andWhere('a.status = :s', { s: q.status.toUpperCase() });
    if (q.month) {
      const [y, m] = q.month.split('-').map(Number);
      qb.andWhere('a.periodYear = :py', { py: y });
      if (m)
        qb.andWhere('a.periodCode LIKE :pc', {
          pc: `%${String(m).padStart(2, '0')}%`,
        });
    }

    applySearch(qb, q.q, this.searchFields);
    applySort(qb, q.sort, q.order, this.sortConfig);
    return paginate(qb, q.page, q.limit);
  }
}
