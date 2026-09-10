import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { FilesService } from './files.service';
import { PayrollInputFileEntity } from '../payroll/entities/payroll-input-file.entity';
import { RegistersRecordEntity } from '../payroll/entities/registers-record.entity';
import { HelpdeskMessageFileEntity } from '../helpdesk/entities/helpdesk-message-file.entity';
import { ContractorDocumentEntity } from '../contractor/entities/contractor-document.entity';
import { PayrollClientAssignmentEntity } from '../payroll/entities/payroll-client-assignment.entity';
import { AccessScopeService } from '../access/access-scope.service';

describe('FilesService', () => {
  const mockRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    delete: jest.fn(),
  };

  /**
   * Builds the service with a fake `manager.query` standing in for the document
   * tables, so the ownership rule can be exercised without a database.
   *
   * `rows` maps a table name to the single owning row that table would return.
   */
  async function build(
    rows: Record<
      string,
      { clientId: string | null; branchId: string | null; employeeId: string | null }
    >,
    scope: any = { level: 'all' },
  ) {
    const query = jest.fn(async (sql: string) => {
      const table = Object.keys(rows).find((t) =>
        new RegExp(`FROM ${t}\\b`).test(sql),
      );
      return table ? [rows[table]] : [];
    });

    const scopeService = {
      getScope: jest.fn().mockResolvedValue(scope),
      assertClientAllowed: jest.fn(async (_user: any, clientId: string) => {
        if (scope.level === 'all') return;
        if (scope.level === 'client' && scope.clientId !== clientId) {
          throw new ForbiddenException('Client not in scope');
        }
        if (scope.level === 'branches' && scope.clientId !== clientId) {
          throw new ForbiddenException('Client not in scope');
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        ...[
          PayrollInputFileEntity,
          RegistersRecordEntity,
          HelpdeskMessageFileEntity,
          PayrollClientAssignmentEntity,
        ].map((e) => ({
          provide: getRepositoryToken(e),
          useValue: { ...mockRepo },
        })),
        {
          provide: getRepositoryToken(ContractorDocumentEntity),
          useValue: { ...mockRepo, manager: { query } },
        },
        { provide: AccessScopeService, useValue: scopeService },
      ],
    }).compile();

    return {
      service: module.get<FilesService>(FilesService),
      scopeService,
    };
  }

  const user = (over: Partial<any> = {}) =>
    ({
      id: 'u1',
      userId: 'u1',
      roleCode: 'CLIENT',
      clientId: 'client-a',
      branchIds: [],
      assignedClientIds: [],
      employeeId: null,
      ...over,
    }) as any;

  it('should be defined', async () => {
    const { service } = await build({});
    expect(service).toBeDefined();
  });

  /**
   * A valid token used to be the whole test on the static /uploads route, so
   * any signed-in user could read another tenant's compliance evidence,
   * payslip or employee document by knowing its path.
   */
  describe('documents owned by a client', () => {
    const complianceRow = {
      clientId: 'client-a',
      branchId: 'branch-1',
      employeeId: null,
    };

    it('allows a client user their own document', async () => {
      const { service } = await build(
        { compliance_documents: complianceRow },
        { level: 'client', clientId: 'client-a' },
      );
      await expect(
        service.assertCanDownload(user(), 'compliance/client-a/b/f.pdf'),
      ).resolves.toBeUndefined();
    });

    it("refuses another tenant's document", async () => {
      const { service } = await build(
        { compliance_documents: complianceRow },
        { level: 'client', clientId: 'client-b' },
      );
      await expect(
        service.assertCanDownload(
          user({ clientId: 'client-b' }),
          'compliance/client-a/b/f.pdf',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a branch user a document from a branch they cannot see', async () => {
      const { service } = await build(
        { compliance_documents: complianceRow },
        { level: 'branches', clientId: 'client-a', branchIds: ['branch-9'] },
      );
      await expect(
        service.assertCanDownload(
          user({ branchIds: ['branch-9'] }),
          'compliance/client-a/b/f.pdf',
        ),
      ).rejects.toThrow(/Branch not in scope/);
    });

    it('allows a branch user a document from their own branch', async () => {
      const { service } = await build(
        { compliance_documents: complianceRow },
        { level: 'branches', clientId: 'client-a', branchIds: ['branch-1'] },
      );
      await expect(
        service.assertCanDownload(
          user({ branchIds: ['branch-1'] }),
          'compliance/client-a/b/f.pdf',
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('documents owned by an employee', () => {
    const empRow = {
      clientId: 'client-a',
      branchId: null,
      employeeId: 'emp-1',
    };

    it('allows an employee their own document', async () => {
      const { service } = await build({ employee_documents: empRow });
      await expect(
        service.assertCanDownload(
          user({ roleCode: 'EMPLOYEE', employeeId: 'emp-1' }),
          'employee-documents/emp-1/id.pdf',
        ),
      ).resolves.toBeUndefined();
    });

    it("refuses an employee someone else's document", async () => {
      // Client scope would otherwise let this through — a colleague's ID proof
      // is not theirs to read.
      const { service } = await build({ employee_documents: empRow });
      await expect(
        service.assertCanDownload(
          user({ roleCode: 'EMPLOYEE', employeeId: 'emp-2' }),
          'employee-documents/emp-1/id.pdf',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  it('refuses a file no table claims, rather than serving it', async () => {
    const { service } = await build({});
    await expect(
      service.assertCanDownload(user(), 'compliance/anything.pdf'),
    ).rejects.toThrow(BadRequestException);
  });

  it('keeps looking when a table is missing from this build', async () => {
    // A deployment without one of these tables must not fail every download.
    const query = jest.fn(async (sql: string) => {
      if (/FROM compliance_documents\b/.test(sql)) {
        throw new Error('relation "compliance_documents" does not exist');
      }
      if (/FROM employee_documents\b/.test(sql)) {
        return [{ clientId: 'client-a', branchId: null, employeeId: 'emp-1' }];
      }
      return [];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        ...[
          PayrollInputFileEntity,
          RegistersRecordEntity,
          HelpdeskMessageFileEntity,
          PayrollClientAssignmentEntity,
        ].map((e) => ({
          provide: getRepositoryToken(e),
          useValue: { ...mockRepo },
        })),
        {
          provide: getRepositoryToken(ContractorDocumentEntity),
          useValue: { ...mockRepo, manager: { query } },
        },
        {
          provide: AccessScopeService,
          useValue: {
            getScope: jest.fn().mockResolvedValue({ level: 'all' }),
            assertClientAllowed: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    const service = module.get<FilesService>(FilesService);
    await expect(
      service.assertCanDownload(
        user({ roleCode: 'EMPLOYEE', employeeId: 'emp-1' }),
        'employee-documents/emp-1/id.pdf',
      ),
    ).resolves.toBeUndefined();
  });
});
