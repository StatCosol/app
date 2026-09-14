import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BranchComplianceService } from './branch-compliance.service';
import { ComplianceDocumentEntity } from './entities/compliance-document.entity';
import { ComplianceReturnMasterEntity } from './entities/compliance-return-master.entity';
import { BranchAccessService } from '../auth/branch-access.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { RejectionMailService } from '../email/rejection-mail.service';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';

/** Chainable QueryBuilder double that records every andWhere clause. */
function makeQb() {
  const where: Array<[string, Record<string, unknown> | undefined]> = [];
  const qb: any = {
    where,
    leftJoinAndSelect: jest.fn(() => qb),
    select: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getRawOne: jest.fn().mockResolvedValue({ total: 0 }),
  };
  qb.where = jest.fn((sql: string, params?: Record<string, unknown>) => {
    where.push([sql, params]);
    return qb;
  });
  qb.andWhere = jest.fn((sql: string, params?: Record<string, unknown>) => {
    where.push([sql, params]);
    return qb;
  });
  qb.clauses = where;
  return qb;
}

const user = (roleCode: string, id = 'crm-itc'): ReqUser => ({
  id,
  userId: id,
  roleCode,
  email: `${id}@example.com`,
  clientId: null,
  userType: null,
  employeeId: null,
  branchIds: [],
  assignedClientIds: [],
});

describe('BranchComplianceService', () => {
  let service: BranchComplianceService;
  let qb: ReturnType<typeof makeQb>;
  let docRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  // client_assignments_current rows returned for the calling user
  let assignedClientIds: string[];

  beforeEach(async () => {
    qb = makeQb();
    assignedClientIds = ['client-itc'];
    docRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn(async (d) => d),
      createQueryBuilder: jest.fn(() => qb),
    };
    // The real scope service, so these tests exercise the actual CRM/AUDITOR
    // resolution (client_assignments_current) rather than a stub of it.
    const caRepo = {
      manager: {
        query: jest.fn(async () =>
          assignedClientIds.map((client_id) => ({ client_id })),
        ),
      },
    };
    const accessScope = new AccessScopeService(
      caRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchComplianceService,
        {
          provide: getRepositoryToken(ComplianceDocumentEntity),
          useValue: docRepo,
        },
        {
          provide: getRepositoryToken(ComplianceReturnMasterEntity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        { provide: BranchAccessService, useValue: {} },
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: AuditLogsService, useValue: { log: jest.fn() } },
        { provide: RejectionMailService, useValue: {} },
        { provide: AccessScopeService, useValue: accessScope },
      ],
    }).compile();

    service = module.get<BranchComplianceService>(BranchComplianceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('CRM compliance documents are limited to assigned clients', () => {
    it("restricts the review list to the CRM user's clients when no client filter is chosen", async () => {
      // Reported: an ITC CRM choosing "All Clients" saw Vedha's PF/ESI documents.
      await service.listForCrmReview(user('CRM'), {} as any);
      expect(qb.clauses).toContainEqual([
        'd.companyId IN (:...scopeIds)',
        { scopeIds: ['client-itc'] },
      ]);
    });

    it('still applies the assignment scope when another client is named', async () => {
      await service.listForCrmReview(user('CRM'), {
        companyId: 'client-vedha',
      } as any);
      expect(qb.clauses).toContainEqual([
        'd.companyId IN (:...scopeIds)',
        { scopeIds: ['client-itc'] },
      ]);
    });

    it('returns nothing for a CRM user with no assignments', async () => {
      assignedClientIds = [];
      await service.listForCrmReview(user('CRM'), {} as any);
      expect(qb.clauses).toContainEqual(['1 = 0', undefined]);
    });

    it('scopes the CRM dashboard counts the same way', async () => {
      await service.getCrmDashboardKpis(user('CRM'), {});
      expect(qb.clauses).toContainEqual([
        'd.companyId IN (:...scopeIds)',
        { scopeIds: ['client-itc'] },
      ]);
    });

    it("does not let a CRM approve another client's document by id", async () => {
      docRepo.findOne.mockResolvedValue({
        id: 'doc-1',
        companyId: 'client-vedha',
        status: 'SUBMITTED',
      });
      await expect(
        service.reviewDocument(user('CRM'), 'doc-1', {
          status: 'APPROVED',
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(docRepo.save).not.toHaveBeenCalled();
    });

    it('lets a CRM review a document of an assigned client', async () => {
      docRepo.findOne.mockResolvedValue({
        id: 'doc-2',
        companyId: 'client-itc',
        status: 'SUBMITTED',
      });
      const saved = await service.reviewDocument(user('CRM'), 'doc-2', {
        status: 'APPROVED',
      } as any);
      expect(saved.status).toBe('APPROVED');
      expect(docRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('auditor compliance documents', () => {
    it('restricts the auditor list to assigned clients', async () => {
      await service.listForAuditor(user('AUDITOR', 'auditor-1'), {} as any);
      expect(qb.clauses).toContainEqual([
        'd.companyId IN (:...scopeIds)',
        { scopeIds: ['client-itc'] },
      ]);
    });
  });
});
