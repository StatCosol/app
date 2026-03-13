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
import { ComplianceDocumentEntity } from '../branch-compliance/entities/compliance-document.entity';
import { ContractorDocumentEntity } from '../contractor/entities/contractor-document.entity';

@Injectable()
export class DocListService {
  constructor(
    private readonly ds: DataSource,
    private readonly scope: AccessScopeService,
  ) {}

  /* ── Compliance Documents ─────────────────────────────────────── */

  private readonly compDocSearch = [
    'd.returnName',
    'd.lawArea',
    'branch.branchName',
    'company.clientName',
  ];

  private readonly compDocSort: SortConfig = {
    sortMap: {
      documentName: 'd.returnName',
      status: 'd.status',
      category: 'd.lawArea',
      updatedAt: 'd.updatedAt',
      uploadedAt: 'd.uploadedAt',
      branchName: 'branch.branchName',
    },
    defaultSort: 'd.updatedAt',
    defaultOrder: 'DESC',
  };

  async listComplianceDocs(
    user: ReqUser,
    q: ScopedListQueryDto,
  ): Promise<Page<ComplianceDocumentEntity>> {
    const scopeResult = await this.scope.getScope(user);
    const qb = this.ds
      .getRepository(ComplianceDocumentEntity)
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.branch', 'branch')
      .leftJoinAndSelect('d.company', 'company');

    // ComplianceDocument uses companyId (not clientId)
    this.scope.applyToQb(qb, scopeResult, {
      clientPath: 'd.companyId',
      branchPath: 'd.branchId',
    });

    const cid = this.scope.resolveClientId(user, q.clientId);
    if (cid) qb.andWhere('d.companyId = :cid', { cid });
    const bid = this.scope.resolveBranchId(user, q.branchId);
    if (bid) qb.andWhere('d.branchId = :bid', { bid });

    if (q.status) qb.andWhere('d.status = :s', { s: q.status });
    if (q.category) qb.andWhere('d.lawArea = :cat', { cat: q.category });
    if (q.entityType) qb.andWhere('d.moduleSource = :et', { et: q.entityType });
    if (q.month) {
      const [y, m] = q.month.split('-').map(Number);
      qb.andWhere('d.periodYear = :py', { py: y });
      qb.andWhere('d.periodMonth = :pm', { pm: m });
    }

    applySearch(qb, q.q, this.compDocSearch);
    applySort(qb, q.sort, q.order, this.compDocSort);
    return paginate(qb, q.page, q.limit);
  }

  /* ── Contractor Documents ─────────────────────────────────────── */

  private readonly conDocSearch = [
    'cd.title',
    'cd.docType',
    'branch.branchName',
  ];

  private readonly conDocSort: SortConfig = {
    sortMap: {
      documentName: 'cd.title',
      status: 'cd.status',
      uploadedAt: 'cd.createdAt',
      updatedAt: 'cd.createdAt',
    },
    defaultSort: 'cd.createdAt',
    defaultOrder: 'DESC',
  };

  async listContractorDocs(
    user: ReqUser,
    q: ScopedListQueryDto,
  ): Promise<Page<ContractorDocumentEntity>> {
    const scopeResult = await this.scope.getScope(user);
    const qb = this.ds
      .getRepository(ContractorDocumentEntity)
      .createQueryBuilder('cd')
      .leftJoinAndSelect('cd.client', 'client')
      .leftJoinAndSelect('cd.branch', 'branch')
      .leftJoinAndSelect('cd.contractorUser', 'contractor');

    this.scope.applyToQb(qb, scopeResult, {
      clientPath: 'cd.clientId',
      branchPath: 'cd.branchId',
    });

    const cid = this.scope.resolveClientId(user, q.clientId);
    if (cid) qb.andWhere('cd.clientId = :cid', { cid });
    const bid = this.scope.resolveBranchId(user, q.branchId);
    if (bid) qb.andWhere('cd.branchId = :bid', { bid });

    if (q.status) qb.andWhere('cd.status = :s', { s: q.status });
    if (q.month) qb.andWhere('cd.docMonth = :dm', { dm: q.month });

    applySearch(qb, q.q, this.conDocSearch);
    applySort(qb, q.sort, q.order, this.conDocSort);
    return paginate(qb, q.page, q.limit);
  }
}
