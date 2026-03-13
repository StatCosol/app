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
import { EmployeeEntity } from '../employees/entities/employee.entity';

@Injectable()
export class EmployeeListService {
  constructor(
    private readonly ds: DataSource,
    private readonly scope: AccessScopeService,
  ) {}

  private readonly searchFields = [
    'e.firstName',
    'e.lastName',
    'e.employeeCode',
    'e.uan',
    'e.esic',
    'e.phone',
  ];

  private readonly sortConfig: SortConfig = {
    sortMap: {
      employeeName: 'e.firstName',
      employeeCode: 'e.employeeCode',
      joinDate: 'e.dateOfJoining',
      pfStatus: 'e.pfRegistered',
      esiStatus: 'e.esiRegistered',
      updatedAt: 'e.updatedAt',
    },
    defaultSort: 'e.firstName',
    defaultOrder: 'ASC',
  };

  async list(
    user: ReqUser,
    q: ScopedListQueryDto,
  ): Promise<Page<EmployeeEntity>> {
    const scopeResult = await this.scope.getScope(user);
    const qb = this.ds
      .getRepository(EmployeeEntity)
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.client', 'client')
      .leftJoinAndSelect('e.branch', 'branch')
      .where('e.isActive = :active', { active: true });

    this.scope.applyToQb(qb, scopeResult, {
      clientPath: 'e.clientId',
      branchPath: 'e.branchId',
    });

    const cid = this.scope.resolveClientId(user, q.clientId);
    if (cid) qb.andWhere('e.clientId = :cid', { cid });
    const bid = this.scope.resolveBranchId(user, q.branchId);
    if (bid) qb.andWhere('e.branchId = :bid', { bid });

    applySearch(qb, q.q, this.searchFields);
    applySort(qb, q.sort, q.order, this.sortConfig);
    return paginate(qb, q.page, q.limit);
  }

  /**
   * PF/ESI pending drill-down: employees with PF or ESI applicable but not registered.
   */
  async listPfEsiPending(
    user: ReqUser,
    q: ScopedListQueryDto,
  ): Promise<Page<EmployeeEntity>> {
    const scopeResult = await this.scope.getScope(user);
    const qb = this.ds
      .getRepository(EmployeeEntity)
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.client', 'client')
      .leftJoinAndSelect('e.branch', 'branch')
      .where('e.isActive = :active', { active: true })
      .andWhere(
        '((e.pfApplicable = true AND e.pfRegistered = false) OR (e.esiApplicable = true AND e.esiRegistered = false))',
      );

    this.scope.applyToQb(qb, scopeResult, {
      clientPath: 'e.clientId',
      branchPath: 'e.branchId',
    });

    const cid = this.scope.resolveClientId(user, q.clientId);
    if (cid) qb.andWhere('e.clientId = :cid', { cid });
    const bid = this.scope.resolveBranchId(user, q.branchId);
    if (bid) qb.andWhere('e.branchId = :bid', { bid });

    applySearch(qb, q.q, this.searchFields);
    applySort(qb, q.sort, q.order, {
      ...this.sortConfig,
      defaultSort: 'e.updatedAt',
      defaultOrder: 'DESC',
    });
    return paginate(qb, q.page, q.limit);
  }
}
