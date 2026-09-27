import { ForbiddenException } from '@nestjs/common';
import { EmployeeDocumentService } from './employee-document.service';
import { EmployeeDocumentUploadGuard } from './employee-document-upload.guard';
import { ClientEmployeesController } from './employees.controller';
import { MasterDataController } from './master-data.controller';
import { EmployeeDocumentController } from './employee-document.controller';
import * as fs from 'fs';
import * as path from 'path';

describe('Employee review scope', () => {
  afterEach(() => jest.restoreAllMocks());
  const user = {
    id: 'user',
    userId: 'user',
    roleCode: 'CLIENT',
    userType: 'BRANCH',
    clientId: 'client',
  } as any;

  it('requires employee ownership before listing or uploading documents', async () => {
    const repo = { find: jest.fn(), create: jest.fn(), save: jest.fn() };
    const employees = {
      findOne: jest.fn().mockResolvedValue({
        id: 'employee',
        clientId: 'other',
        branchId: 'branch',
      }),
    };
    const access = {
      assertDocumentInScope: jest
        .fn()
        .mockRejectedValue(new ForbiddenException()),
    };
    const service = new EmployeeDocumentService(
      repo as any,
      employees as any,
      access as any,
    );
    await expect(service.listForEmployee(user, 'employee')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.upload(user, { employeeId: 'employee' } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(repo.find).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('derives document client ownership from the authorized employee, including admin uploads', async () => {
    const repo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const employees = {
      findOne: jest.fn().mockResolvedValue({
        id: 'employee',
        clientId: 'owner',
        branchId: 'branch',
      }),
    };
    const access = { assertDocumentInScope: jest.fn() };
    const service = new EmployeeDocumentService(
      repo as any,
      employees as any,
      access as any,
    );
    const result = await service.upload(
      { ...user, clientId: null, roleCode: 'ADMIN' },
      { employeeId: 'employee', uploadedByUserId: 'user' } as any,
    );
    expect(result.clientId).toBe('owner');
  });

  it('does not let an orphaned document bypass the employee ownership lookup', async () => {
    const repo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ employeeId: 'employee', clientId: 'owner' }),
    };
    const employees = { findOne: jest.fn().mockResolvedValue(null) };
    const access = { assertDocumentInScope: jest.fn() };
    const service = new EmployeeDocumentService(
      repo as any,
      employees as any,
      access as any,
    );
    await expect(service.findForUser('doc', user)).rejects.toThrow(
      'Document employee not found',
    );
    expect(employees.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'employee', clientId: 'owner' } }),
    );
  });

  it('authorizes employee uploads in a guard before file interception', async () => {
    const documents = {
      assertCanAccessEmployee: jest
        .fn()
        .mockRejectedValue(new ForbiddenException()),
    };
    const guard = new EmployeeDocumentUploadGuard(documents as any);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { employeeId: '11111111-1111-4111-8111-111111111111' },
        }),
      }),
    } as any;
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    documents.assertCanAccessEmployee.mockResolvedValue({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it.each(['listDepartments', 'listGrades', 'listDesignations'] as const)(
    'checks requested client ownership before reading %s',
    async (method) => {
      const ds = { getRepository: jest.fn() };
      const access = {
        assertClientAllowed: jest
          .fn()
          .mockRejectedValue(new ForbiddenException()),
      };
      const controller = new MasterDataController(ds as any, access as any);
      await expect(controller[method](user, 'another-client')).rejects.toThrow(
        ForbiddenException,
      );
      expect(ds.getRepository).not.toHaveBeenCalled();
    },
  );

  it('denies unassigned branch users employee writes and broad lists', async () => {
    const service = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'employee', branchId: 'branch' }),
      hardDelete: jest.fn(),
      list: jest.fn(),
    };
    const branches = { getUserBranchIds: jest.fn().mockResolvedValue([]) };
    const controller = new ClientEmployeesController(
      service as any,
      branches as any,
      {} as any,
      {} as any,
    );
    await expect(controller.hardDelete(user, 'employee')).rejects.toThrow(
      ForbiddenException,
    );
    expect(service.hardDelete).not.toHaveBeenCalled();
    expect(await controller.list(user, {} as any)).toEqual({
      data: [],
      total: 0,
    });
    expect(service.list).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'removes rejected persisted uploads and preserves the original error (cleanup failure: %s)',
    async (cleanupFails) => {
      const rejection = new ForbiddenException('Assignment removed');
      const service = { upload: jest.fn().mockRejectedValue(rejection) };
      const unlink = jest.spyOn(fs.promises, 'unlink');
      if (cleanupFails) unlink.mockRejectedValue(new Error('Disk unavailable'));
      else unlink.mockResolvedValue();
      const controller = new EmployeeDocumentController(service as any);
      const file = {
        path: path.resolve('uploads/employee-documents/test.pdf'),
        originalname: 'test.pdf',
        filename: 'test.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;
      await expect(
        controller.upload('employee', file, 'OTHER', 'Test', undefined, user),
      ).rejects.toBe(rejection);
      expect(unlink).toHaveBeenCalledWith(file.path);
    },
  );

  it('does not delete a path outside the employee upload directory on rejection', async () => {
    const unlink = jest.spyOn(fs.promises, 'unlink').mockResolvedValue();
    const controller = new EmployeeDocumentController({
      upload: jest.fn().mockRejectedValue(new ForbiddenException()),
    } as any);
    const file = {
      path: path.resolve('uploads/another-feature/test.pdf'),
      originalname: 'test.pdf',
    } as Express.Multer.File;
    await expect(
      controller.upload('employee', file, 'OTHER', 'Test', undefined, user),
    ).rejects.toThrow(ForbiddenException);
    expect(unlink).not.toHaveBeenCalled();
  });
});
