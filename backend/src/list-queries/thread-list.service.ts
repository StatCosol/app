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
import { NotificationThread } from '../notifications/entities/notification-thread.entity';
import { HelpdeskTicketEntity } from '../helpdesk/entities/helpdesk-ticket.entity';

@Injectable()
export class ThreadListService {
  constructor(
    private readonly ds: DataSource,
    private readonly scope: AccessScopeService,
  ) {}

  /* ── Notification Threads (queries / support inbox) ───────────── */

  private readonly threadSearch = ['th.subject', 'client.clientName'];

  private readonly threadSort: SortConfig = {
    sortMap: {
      lastMessageAt: 'th.updatedAt',
      status: 'th.status',
      type: 'th.queryType',
      subject: 'th.subject',
    },
    defaultSort: 'th.updatedAt',
    defaultOrder: 'DESC',
  };

  async listThreads(
    user: ReqUser,
    q: ScopedListQueryDto,
  ): Promise<Page<NotificationThread>> {
    const scopeResult = await this.scope.getScope(user);
    const qb = this.ds
      .getRepository(NotificationThread)
      .createQueryBuilder('th')
      .leftJoinAndSelect('th.client', 'client')
      .leftJoinAndSelect('th.branch', 'branch')
      .leftJoinAndSelect('th.createdByUser', 'creator');

    this.scope.applyToQb(qb, scopeResult, {
      clientPath: 'th.clientId',
      branchPath: 'th.branchId',
    });

    const cid = this.scope.resolveClientId(user, q.clientId);
    if (cid) qb.andWhere('th.clientId = :cid', { cid });

    if (q.status) qb.andWhere('th.status = :s', { s: q.status.toUpperCase() });
    if (q.type) qb.andWhere('th.queryType = :t', { t: q.type.toUpperCase() });

    // For non-admin roles: only see threads created by or assigned to this user
    if (scopeResult.level !== 'all') {
      qb.andWhere('(th.createdByUserId = :uid OR th.assignedToUserId = :uid)', {
        uid: user.id,
      });
    }

    applySearch(qb, q.q, this.threadSearch);
    applySort(qb, q.sort, q.order, this.threadSort);
    return paginate(qb, q.page, q.limit);
  }

  /* ── Helpdesk Tickets ─────────────────────────────────────────── */

  private readonly helpdeskSearch = ['hd.category', 'hd.description'];

  private readonly helpdeskSort: SortConfig = {
    sortMap: {
      status: 'hd.status',
      priority: 'hd.priority',
      category: 'hd.category',
      createdAt: 'hd.createdAt',
      updatedAt: 'hd.updatedAt',
    },
    defaultSort: 'hd.updatedAt',
    defaultOrder: 'DESC',
  };

  async listHelpdesk(
    user: ReqUser,
    q: ScopedListQueryDto,
  ): Promise<Page<HelpdeskTicketEntity>> {
    const scopeResult = await this.scope.getScope(user);
    const qb = this.ds
      .getRepository(HelpdeskTicketEntity)
      .createQueryBuilder('hd')
      .leftJoinAndSelect('hd.client', 'client')
      .leftJoinAndSelect('hd.branchEntity', 'branch');

    this.scope.applyToQb(qb, scopeResult, {
      clientPath: 'hd.clientId',
      branchPath: 'hd.branchId',
    });

    const cid = this.scope.resolveClientId(user, q.clientId);
    if (cid) qb.andWhere('hd.clientId = :cid', { cid });

    if (q.status) qb.andWhere('hd.status = :s', { s: q.status.toUpperCase() });
    if (q.category) qb.andWhere('hd.category = :cat', { cat: q.category });

    // Non-admin: only own tickets
    if (scopeResult.level !== 'all') {
      qb.andWhere('(hd.createdByUserId = :uid OR hd.assignedToUserId = :uid)', {
        uid: user.id,
      });
    }

    applySearch(qb, q.q, this.helpdeskSearch);
    applySort(qb, q.sort, q.order, this.helpdeskSort);
    return paginate(qb, q.page, q.limit);
  }
}
