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
import { EscalationEntity } from '../escalations/entities/escalation.entity';

@Injectable()
export class EscalationListService {
  constructor(
    private readonly ds: DataSource,
    private readonly scope: AccessScopeService,
  ) {}

  private readonly searchFields = [
    'client.clientName',
    'branch.branchName',
    'e.reason',
  ];

  private readonly sortConfig: SortConfig = {
    sortMap: {
      severity: 'e.riskScore',
      status: 'e.status',
      createdAt: 'e.createdAt',
      clientName: 'client.clientName',
      branchName: 'branch.branchName',
      ageDays: 'e.createdAt', // sort by age = sort by createdAt ASC
    },
    defaultSort: 'e.riskScore',
    defaultOrder: 'DESC',
  };

  async list(
    user: ReqUser,
    q: ScopedListQueryDto,
  ): Promise<Page<EscalationEntity>> {
    const scopeResult = await this.scope.getScope(user);
    const qb = this.ds
      .getRepository(EscalationEntity)
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.client', 'client')
      .leftJoinAndSelect('e.branch', 'branch');

    this.scope.applyToQb(qb, scopeResult, {
      clientPath: 'e.clientId',
      branchPath: 'e.branchId',
    });

    const cid = this.scope.resolveClientId(user, q.clientId);
    if (cid) qb.andWhere('e.clientId = :cid', { cid });

    if (q.status) qb.andWhere('e.status = :s', { s: q.status.toUpperCase() });
    if (q.severity) {
      qb.andWhere('e.riskScore >= :minRisk', {
        minRisk: q.severity === 'HIGH' ? 80 : q.severity === 'MEDIUM' ? 50 : 0,
      });
    }

    applySearch(qb, q.q, this.searchFields);
    applySort(qb, q.sort, q.order, this.sortConfig);
    return paginate(qb, q.page, q.limit);
  }
}
