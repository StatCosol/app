import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClientPayrollDocumentsService } from './client-payroll-documents.service';
import { ReqUser } from '../access/access-scope.service';

describe('ClientPayrollDocumentsService downloads', () => {
  const branchA = '11111111-1111-1111-1111-111111111111';
  const branchB = '22222222-2222-2222-2222-222222222222';
  const clientId = '33333333-3333-3333-3333-333333333333';

  function user(overrides: Partial<ReqUser> = {}): ReqUser {
    return {
      id: 'user-1',
      userId: 'user-1',
      roleCode: 'CLIENT',
      email: 'branch@example.com',
      clientId,
      userType: 'BRANCH',
      employeeId: null,
      branchIds: [branchA],
      assignedClientIds: [],
      ...overrides,
    };
  }

  function serviceWith(state: {
    run?: any;
    employee?: any;
    master?: any;
    archive?: any;
    settings?: Record<string, unknown>;
    fileExists?: (filePath: string) => boolean;
  }) {
    const settingsRepo = {
      findOne: jest.fn(async () => ({
        settings: {
          allowBranchPayrollAccess: true,
          ...(state.settings || {}),
        },
      })),
    };
    const runRepo = { findOne: jest.fn(async () => state.run ?? null) };
    const runEmployeeRepo = {
      findOne: jest.fn(async () => state.employee ?? null),
      createQueryBuilder: jest.fn(),
    };
    const payslipArchiveRepo = {
      findOne: jest.fn(async () => state.archive ?? null),
    };
    const employeeRepo = { findOne: jest.fn(async () => state.master ?? null) };
    const service = new ClientPayrollDocumentsService(
      settingsRepo as any,
      runRepo as any,
      runEmployeeRepo as any,
      payslipArchiveRepo as any,
      {} as any,
      {} as any,
      employeeRepo as any,
      {} as any,
    );
    (service as any).fileExists = state.fileExists || (() => true);
    return service;
  }

  it('refuses a BranchDesk download for an employee outside authorized branches', async () => {
    const service = serviceWith({
      run: { id: 'run-1', clientId, status: 'APPROVED', branchId: branchB },
      employee: {
        clientId,
        employeeCode: 'B1',
        branchId: branchB,
        employeeId: 'emp-b',
      },
    });

    await expect(
      service.downloadPayslip(user(), 'run-1', 'B1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a payslip that is not on an approved published run', async () => {
    const service = serviceWith({
      run: { id: 'run-1', clientId, status: 'APPROVED', branchId: branchA },
      employee: {
        clientId,
        employeeCode: 'A1',
        branchId: branchA,
        employeeId: 'emp-a',
      },
      archive: null,
    });

    await expect(
      service.downloadPayslip(user(), 'run-1', 'A1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a BranchDesk user when the requested branch is not authorized', async () => {
    const service = serviceWith({});
    await expect(
      service.listEmployeeRecords(user(), {
        periodYear: '2026',
        periodMonth: '9',
        branchId: branchB,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
