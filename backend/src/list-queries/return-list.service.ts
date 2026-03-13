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
import { ComplianceReturnEntity } from '../returns/entities/compliance-return.entity';

type DueKpis = {
  overdue: number;
  dueSoon: number;
  thisMonth: number;
  completed: number;
};

@Injectable()
export class ReturnListService {
  constructor(
    private readonly ds: DataSource,
    private readonly scope: AccessScopeService,
  ) {}

  private readonly searchFields = [
    'client.clientName',
    'branch.branchName',
    'r.lawType',
    'r.returnType',
    'r.periodLabel',
  ];

  private readonly sortConfig: SortConfig = {
    sortMap: {
      dueDate: 'r.dueDate',
      status: 'r.status',
      act: 'r.lawType',
      title: 'r.returnType',
      branchName: 'branch.branchName',
      clientName: 'client.clientName',
      updatedAt: 'r.updatedAt',
    },
    defaultSort: 'r.dueDate',
    defaultOrder: 'ASC',
  };

  /**
   * Unified returns / due-items list.
   * Supports CRM Returns, Client Returns, CRM Renewals/Amendments via `category` filter.
   */
  async list(
    user: ReqUser,
    q: ScopedListQueryDto,
  ): Promise<Page<Record<string, any>>> {
    const scopeResult = await this.scope.getScope(user);
    const qb = this.ds
      .getRepository(ComplianceReturnEntity)
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.client', 'client')
      .leftJoinAndSelect('r.branch', 'branch')
      .where('r.isDeleted = :del', { del: false });

    this.scope.applyToQb(qb, scopeResult, {
      clientPath: 'r.clientId',
      branchPath: 'r.branchId',
    });

    const cid = this.scope.resolveClientId(user, q.clientId);
    if (cid) qb.andWhere('r.clientId = :cid', { cid });
    const bid = this.scope.resolveBranchId(user, q.branchId);
    if (bid) qb.andWhere('r.branchId = :bid', { bid });

    if (q.status) qb.andWhere('r.status = :s', { s: q.status.toUpperCase() });
    this.applyCategory(qb, q.category);
    if (q.month) {
      const [y, m] = q.month.split('-').map(Number);
      qb.andWhere('r.periodYear = :py', { py: y });
      qb.andWhere('r.periodMonth = :pm', { pm: m });
    }
    if (q.tab) this.applyTab(qb, q.tab);

    applySearch(qb, q.q, this.searchFields);
    applySort(qb, q.sort, q.order, this.sortConfig);
    const page = await paginate(qb, q.page, q.limit);

    return {
      ...page,
      items: page.items.map((row) => this.toDueItemRow(row)),
    };
  }

  async kpis(user: ReqUser, q: ScopedListQueryDto): Promise<DueKpis> {
    const scopeResult = await this.scope.getScope(user);
    const qb = this.ds
      .getRepository(ComplianceReturnEntity)
      .createQueryBuilder('r')
      .select([
        `COUNT(*) FILTER (
          WHERE r.dueDate < CURRENT_DATE
            AND r.status NOT IN ('APPROVED','SUBMITTED')
        )::int AS overdue`,
        `COUNT(*) FILTER (
          WHERE r.dueDate >= CURRENT_DATE
            AND r.dueDate <= CURRENT_DATE + interval '7 days'
            AND r.status NOT IN ('APPROVED','SUBMITTED')
        )::int AS "dueSoon"`,
        `COUNT(*) FILTER (
          WHERE r.dueDate >= date_trunc('month', CURRENT_DATE)::date
            AND r.dueDate < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
            AND r.status NOT IN ('APPROVED','SUBMITTED')
        )::int AS "thisMonth"`,
        `COUNT(*) FILTER (WHERE r.status IN ('APPROVED','SUBMITTED'))::int AS completed`,
      ])
      .where('r.isDeleted = :del', { del: false });

    this.scope.applyToQb(qb, scopeResult, {
      clientPath: 'r.clientId',
      branchPath: 'r.branchId',
    });

    const cid = this.scope.resolveClientId(user, q.clientId);
    if (cid) qb.andWhere('r.clientId = :cid', { cid });
    const bid = this.scope.resolveBranchId(user, q.branchId);
    if (bid) qb.andWhere('r.branchId = :bid', { bid });

    this.applyCategory(qb, q.category);
    if (q.month) {
      const [y, m] = q.month.split('-').map(Number);
      qb.andWhere('r.periodYear = :py', { py: y });
      qb.andWhere('r.periodMonth = :pm', { pm: m });
    }

    const raw = await qb.getRawOne<DueKpis | undefined>();
    return {
      overdue: Number(raw?.overdue || 0),
      dueSoon: Number(raw?.dueSoon || 0),
      thisMonth: Number(raw?.thisMonth || 0),
      completed: Number(raw?.completed || 0),
    };
  }

  private applyCategory(qb: any, category?: string) {
    if (!category) return;
    const cat = category.toUpperCase();

    if (cat === 'RENEWAL') {
      qb.andWhere('LOWER(r.returnType) LIKE :renewal', { renewal: '%renewal%' });
      return;
    }

    if (cat === 'AMENDMENT') {
      qb.andWhere('LOWER(r.returnType) LIKE :amend', { amend: '%amend%' });
      return;
    }

    if (cat === 'RETURN') {
      qb.andWhere('LOWER(r.returnType) NOT LIKE :renewal', { renewal: '%renewal%' });
      qb.andWhere('LOWER(r.returnType) NOT LIKE :amend', { amend: '%amend%' });
      return;
    }

    // Backward compatibility: direct law-type based filter
    qb.andWhere('UPPER(r.lawType) = :cat', { cat });
  }

  private toDueItemRow(row: ComplianceReturnEntity): Record<string, any> {
    const category = this.inferCategory(row.returnType);
    const status = this.toUiStatus(row.status, row.dueDate);
    const period = row.periodLabel || this.periodFromYearMonth(row.periodYear, row.periodMonth);

    return {
      id: row.id,
      clientId: row.clientId,
      clientName: row.client?.clientName || '-',
      branchId: row.branchId || '',
      branchName: row.branch?.branchName || '-',
      category,
      act: row.lawType,
      title: row.returnType,
      period,
      dueDate: row.dueDate,
      status,
      assigneeRole: row.crmOwner ? 'CRM' : 'BRANCH',
      evidenceUrl: row.ackFilePath || row.challanFilePath || null,
      remarks: row.crmLastNote || null,
      lastUpdatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ''),
      ownerAssigned: row.crmOwner || null,
      lastReminderAt:
        row.crmLastReminderAt instanceof Date
          ? row.crmLastReminderAt.toISOString()
          : row.crmLastReminderAt
            ? String(row.crmLastReminderAt)
            : null,
    };
  }

  private inferCategory(returnType?: string | null): 'RETURN' | 'RENEWAL' | 'AMENDMENT' {
    const text = (returnType || '').toLowerCase();
    if (text.includes('renewal')) return 'RENEWAL';
    if (text.includes('amend')) return 'AMENDMENT';
    return 'RETURN';
  }

  private periodFromYearMonth(year?: number | null, month?: number | null): string | null {
    if (!year) return null;
    if (!month) return String(year);
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  private toUiStatus(status: string, dueDate?: string | null) {
    if (!dueDate) return status;
    if (status === 'APPROVED' || status === 'SUBMITTED' || status === 'REJECTED') {
      return status;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (dueDate < today) return 'OVERDUE';
    return status;
  }

  private applyTab(qb: any, tab: string) {
    const today = new Date().toISOString().slice(0, 10);
    switch (tab.toUpperCase()) {
      case 'OVERDUE':
        qb.andWhere('r.dueDate < :today', { today });
        qb.andWhere('r.status NOT IN (:...done)', {
          done: ['APPROVED', 'SUBMITTED'],
        });
        break;
      case 'DUE_SOON': {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        qb.andWhere('r.dueDate >= :today', { today });
        qb.andWhere('r.dueDate <= :soon', {
          soon: d.toISOString().slice(0, 10),
        });
        qb.andWhere('r.status NOT IN (:...done)', {
          done: ['APPROVED', 'SUBMITTED'],
        });
        break;
      }
      case 'THIS_MONTH':
        qb.andWhere(
          `r.dueDate >= date_trunc('month', CURRENT_DATE)::date
           AND r.dueDate < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date`,
        );
        qb.andWhere('r.status NOT IN (:...done)', {
          done: ['APPROVED', 'SUBMITTED'],
        });
        break;
      case 'COMPLETED':
        qb.andWhere('r.status IN (:...done)', {
          done: ['APPROVED', 'SUBMITTED'],
        });
        break;
      case 'PENDING':
        qb.andWhere('r.status = :ps', { ps: 'PENDING' });
        break;
    }
  }
}
