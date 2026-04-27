import { Injectable } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { ScopedListQueryDto } from '../common/dto/scoped-list-query.dto';
import { Page } from '../common/types/page.type';
import {
  applySearch,
  applySort,
  paginate,
  SortConfig,
} from '../common/db/paginate-qb';
import { ComplianceTask } from '../compliance/entities/compliance-task.entity';
import { ComplianceMcdItem } from '../compliance/entities/compliance-mcd-item.entity';

@Injectable()
export class TaskListService {
  constructor(
    private readonly ds: DataSource,
    private readonly scope: AccessScopeService,
  ) {}

  /* ── Tasks ────────────────────────────────────────────────────── */

  private readonly taskSearch = [
    'client.clientName',
    'branch.branchName',
    't.title',
  ];

  private readonly taskSort: SortConfig = {
    sortMap: {
      dueDate: 't.dueDate',
      status: 't.status',
      title: 't.title',
      branchName: 'branch.branchName',
      clientName: 'client.clientName',
      updatedAt: 't.updatedAt',
      createdAt: 't.createdAt',
    },
    defaultSort: 't.dueDate',
    defaultOrder: 'ASC',
  };

  async listTasks(
    user: ReqUser,
    q: ScopedListQueryDto,
  ): Promise<Page<ComplianceTask>> {
    const scopeResult = await this.scope.getScope(user);
    const qb = this.ds
      .getRepository(ComplianceTask)
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.client', 'client')
      .leftJoinAndSelect('t.branch', 'branch');

    this.scope.applyToQb(qb, scopeResult);

    const cid = this.scope.resolveClientId(user, q.clientId);
    if (cid) qb.andWhere('t.clientId = :cid', { cid });
    const bid = this.scope.resolveBranchId(user, q.branchId);
    if (bid) qb.andWhere('t.branchId = :bid', { bid });
    if (q.status) qb.andWhere('t.status = :s', { s: q.status.toUpperCase() });
    if (q.month) {
      const [y, m] = q.month.split('-').map(Number);
      qb.andWhere('t.periodYear = :py', { py: y });
      qb.andWhere('t.periodMonth = :pm', { pm: m });
    }
    if (q.tab) this.applyTaskTab(qb, q.tab);

    applySearch(qb, q.q, this.taskSearch);
    applySort(qb, q.sort, q.order, this.taskSort);
    return paginate(qb, q.page, q.limit);
  }

  private applyTaskTab(qb: SelectQueryBuilder<ComplianceTask>, tab: string) {
    const today = new Date().toISOString().slice(0, 10);
    switch (tab.toUpperCase()) {
      case 'OVERDUE':
        qb.andWhere('t.dueDate < :today', { today });
        qb.andWhere('t.status NOT IN (:...done)', { done: ['APPROVED'] });
        break;
      case 'DUE_SOON': {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        const soon = d.toISOString().slice(0, 10);
        qb.andWhere('t.dueDate >= :today', { today });
        qb.andWhere('t.dueDate <= :soon', { soon });
        qb.andWhere('t.status NOT IN (:...done)', { done: ['APPROVED'] });
        break;
      }
      case 'THIS_MONTH':
        qb.andWhere("TO_CHAR(t.dueDate::date, 'YYYY-MM') = :ym", {
          ym: today.slice(0, 7),
        });
        break;
    }
  }

  /* ── MCD Items ────────────────────────────────────────────────── */

  private readonly mcdSearch = ['i.itemLabel'];

  private readonly mcdSort: SortConfig = {
    sortMap: {
      itemName: 'i.itemLabel',
      status: 'i.status',
      updatedAt: 'i.updatedAt',
    },
    defaultSort: 'i.itemLabel',
    defaultOrder: 'ASC',
  };

  async listMcdItems(
    user: ReqUser,
    q: ScopedListQueryDto,
  ): Promise<Page<ComplianceMcdItem>> {
    const scopeResult = await this.scope.getScope(user);
    const qb = this.ds
      .getRepository(ComplianceMcdItem)
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.task', 'task');

    // Scope via parent task's clientId / branchId
    this.scope.applyToQb(qb, scopeResult, {
      clientPath: 'task.clientId',
      branchPath: 'task.branchId',
    });

    const cid = this.scope.resolveClientId(user, q.clientId);
    if (cid) qb.andWhere('task.clientId = :cid', { cid });
    const bid = this.scope.resolveBranchId(user, q.branchId);
    if (bid) qb.andWhere('task.branchId = :bid', { bid });

    if (q.month) {
      const [y, m] = q.month.split('-').map(Number);
      qb.andWhere('task.periodYear = :py', { py: y });
      qb.andWhere('task.periodMonth = :pm', { pm: m });
    }
    if (q.status) qb.andWhere('i.status = :s', { s: q.status.toUpperCase() });

    applySearch(qb, q.q, this.mcdSearch);
    applySort(qb, q.sort, q.order, this.mcdSort);
    return paginate(qb, q.page, q.limit);
  }
}
