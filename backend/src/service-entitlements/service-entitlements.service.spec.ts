import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ServiceEntitlementsService } from './service-entitlements.service';

describe('ServiceEntitlementsService', () => {
  let dataSource: jest.Mocked<Pick<DataSource, 'query' | 'transaction'>>;
  let service: ServiceEntitlementsService;
  const clientId = '33333333-3333-4333-8333-333333333333';
  const adminUserId = '11111111-1111-4111-8111-111111111111';
  const ccoUserId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    dataSource = {
      query: jest.fn(),
      transaction: jest.fn(),
    };
    service = new ServiceEntitlementsService(dataSource as unknown as DataSource);
  });

  describe('normalizeModules', () => {
    it('rejects unsupported service modules', () => {
      expect(() =>
        service.normalizeModules('CUSTOM_SERVICES', [
          'EMPLOYEE_COMPLIANCE',
          'UNKNOWN_MODULE' as any,
        ]),
      ).toThrow(BadRequestException);
    });

    it('rejects falsy unsupported service modules', () => {
      expect(() =>
        service.normalizeModules('CUSTOM_SERVICES', [
          'EMPLOYEE_COMPLIANCE',
          '' as any,
        ]),
      ).toThrow(BadRequestException);

      expect(() =>
        service.normalizeModules('CUSTOM_SERVICES', [
          'EMPLOYEE_COMPLIANCE',
          null as any,
        ]),
      ).toThrow(BadRequestException);
    });

    it('deduplicates selected custom service modules', () => {
      expect(
        service.normalizeModules('CUSTOM_SERVICES', [
          'EMPLOYEE_COMPLIANCE',
          'EMPLOYEE_COMPLIANCE',
          'PAYROLL',
        ]),
      ).toEqual(['EMPLOYEE_COMPLIANCE', 'PAYROLL']);
    });

    it('rejects custom module selections for fixed packages', () => {
      expect(() =>
        service.normalizeModules('FULL_SERVICE', ['EMPLOYEE_COMPLIANCE']),
      ).toThrow(BadRequestException);
    });

    it('allows fixed packages when modules match the package definition', () => {
      const modules = service.normalizeModules('CONTRACTOR_AUDIT_ONLY', [
        'CONTRACTOR_AUDIT',
        'CONTRACTOR_PORTAL',
        'CONTRACTOR_DOCUMENTS',
        'CONTRACTOR_ATTENDANCE',
        'CONTRACTOR_FACE_ATTENDANCE',
      ]);

      expect(modules).toEqual([
        'CONTRACTOR_AUDIT',
        'CONTRACTOR_PORTAL',
        'CONTRACTOR_DOCUMENTS',
        'CONTRACTOR_ATTENDANCE',
        'CONTRACTOR_FACE_ATTENDANCE',
      ]);
    });
  });

  describe('reviewRequest', () => {
    beforeEach(() => {
      dataSource.query.mockResolvedValue([
        {
          id: 'request-1',
          clientId,
          packageCode: 'CUSTOM_SERVICES',
          requestedModules: ['EMPLOYEE_COMPLIANCE'],
          currentModules: [],
          status: 'PENDING_CCO',
          requestNote: null,
          reviewNote: null,
          requestedAt: new Date(),
          reviewedAt: null,
          requestedByName: 'Admin',
          reviewedByName: null,
        },
      ]);
    });

    it.each(['REJECTED', 'CHANGES_REQUESTED'] as const)(
      'requires a note for %s reviews',
      async (action) => {
        await expect(
          service.reviewRequest(
            'request-1',
            { action, note: '   ' },
            { id: ccoUserId, userId: ccoUserId } as any,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(dataSource.transaction).not.toHaveBeenCalled();
      },
    );

    it('normalizes stored JSON module text before approving requests', async () => {
      const manager = {
        query: jest.fn().mockResolvedValue([]),
      };
      dataSource.query
        .mockResolvedValueOnce([
          {
            id: 'request-1',
            clientId,
            packageCode: 'CUSTOM_SERVICES',
            requestedModules: '["EMPLOYEE_COMPLIANCE"]',
            currentModules: '[]',
            status: 'PENDING_CCO',
            requestNote: null,
            reviewNote: null,
            requestedAt: new Date(),
            reviewedAt: null,
            requestedByName: 'Admin',
            reviewedByName: null,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'request-1',
            clientId,
            packageCode: 'CUSTOM_SERVICES',
            requestedModules: '["EMPLOYEE_COMPLIANCE"]',
            currentModules: '[]',
            status: 'APPROVED',
            requestNote: null,
            reviewNote: null,
            requestedAt: new Date(),
            reviewedAt: new Date(),
            requestedByName: 'Admin',
            reviewedByName: 'CCO',
          },
        ]);
      (dataSource.transaction as jest.Mock).mockImplementation(async (fn) =>
        fn(manager as any),
      );

      await service.reviewRequest(
        'request-1',
        { action: 'APPROVED' },
        { id: ccoUserId, userId: ccoUserId } as any,
      );

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO client_module_entitlements'),
        [clientId, 'EMPLOYEE_COMPLIANCE', 'request-1', ccoUserId],
      );
    });

    it('rejects approval when stored request modules contain stale codes', async () => {
      const manager = {
        query: jest.fn().mockResolvedValue([]),
      };
      dataSource.query.mockResolvedValueOnce([
        {
          id: 'request-1',
          clientId,
          packageCode: 'CUSTOM_SERVICES',
          requestedModules: '["EMPLOYEE_COMPLIANCE","OLD_MODULE"]',
          currentModules: '[]',
          status: 'PENDING_CCO',
          requestNote: null,
          reviewNote: null,
          requestedAt: new Date(),
          reviewedAt: null,
          requestedByName: 'Admin',
          reviewedByName: null,
        },
      ]);
      (dataSource.transaction as jest.Mock).mockImplementation(async (fn) =>
        fn(manager as any),
      );

      await expect(
        service.reviewRequest(
          'request-1',
          { action: 'APPROVED' },
          { id: ccoUserId, userId: ccoUserId } as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(manager.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO client_module_entitlements'),
        expect.anything(),
      );
    });

    it('rejects non-approval reviews when stored request modules contain stale codes', async () => {
      const manager = {
        query: jest.fn().mockResolvedValue([]),
      };
      dataSource.query.mockResolvedValueOnce([
        {
          id: 'request-1',
          clientId,
          packageCode: 'CUSTOM_SERVICES',
          requestedModules: '["EMPLOYEE_COMPLIANCE","OLD_MODULE"]',
          currentModules: '[]',
          status: 'PENDING_CCO',
          requestNote: null,
          reviewNote: null,
          requestedAt: new Date(),
          reviewedAt: null,
          requestedByName: 'Admin',
          reviewedByName: null,
        },
      ]);
      (dataSource.transaction as jest.Mock).mockImplementation(async (fn) =>
        fn(manager as any),
      );

      await expect(
        service.reviewRequest(
          'request-1',
          { action: 'CHANGES_REQUESTED', note: 'Select supported services only' },
          { id: ccoUserId, userId: ccoUserId } as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects reviews when stored request modules are malformed JSON text', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          id: 'request-1',
          clientId,
          packageCode: 'CUSTOM_SERVICES',
          requestedModules: 'not-json',
          currentModules: '[]',
          status: 'PENDING_CCO',
          requestNote: null,
          reviewNote: null,
          requestedAt: new Date(),
          reviewedAt: null,
          requestedByName: 'Admin',
          reviewedByName: null,
        },
      ]);

      await expect(
        service.reviewRequest(
          'request-1',
          { action: 'APPROVED' },
          { id: ccoUserId, userId: ccoUserId } as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects malformed reviewer ids before reading or writing requests', async () => {
      await expect(
        service.reviewRequest(
          'request-1',
          { action: 'APPROVED' },
          { id: 'not-a-uuid', userId: 'not-a-uuid' } as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(dataSource.query).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('list filters', () => {
    it('rejects unsupported request statuses before querying', async () => {
      await expect(service.listRequests('UNKNOWN')).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('rejects malformed request client ids before querying', async () => {
      await expect(
        service.listRequests('PENDING_CCO', 'not-a-uuid'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('rejects malformed audit client ids before querying', async () => {
      await expect(service.listAuditLogs('not-a-uuid')).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('response module arrays', () => {
    it('normalizes request module JSON text in list responses', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          id: 'request-1',
          clientId: 'client-1',
          packageCode: 'CUSTOM_SERVICES',
          requestedModules: '["EMPLOYEE_COMPLIANCE"]',
          currentModules: '[]',
        },
      ]);

      const result = await service.listRequests();

      expect(result[0].requestedModules).toEqual(['EMPLOYEE_COMPLIANCE']);
      expect(result[0].currentModules).toEqual([]);
    });

    it('normalizes malformed request module JSON text to empty arrays in list responses', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          id: 'request-1',
          clientId: 'client-1',
          packageCode: 'CUSTOM_SERVICES',
          requestedModules: 'not-json',
          currentModules: '[]',
        },
      ]);

      const result = await service.listRequests();

      expect(result[0].requestedModules).toEqual([]);
      expect(result[0].currentModules).toEqual([]);
    });

    it('normalizes audit module JSON text in list responses', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          id: 'audit-1',
          modules: '["PAYROLL"]',
        },
      ]);

      const result = await service.listAuditLogs();

      expect(result[0].modules).toEqual(['PAYROLL']);
    });
  });

  describe('createRequest', () => {
    it('trims request notes before writing request and audit rows', async () => {
      const manager = {
        query: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'request-1' }])
          .mockResolvedValueOnce([]),
      };
      dataSource.query
        .mockResolvedValueOnce([{ id: clientId }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (dataSource.transaction as jest.Mock).mockImplementation(async (fn) =>
        fn(manager as any),
      );
      dataSource.query.mockResolvedValueOnce([
        {
          id: 'request-1',
          clientId,
          packageCode: 'CUSTOM_SERVICES',
          requestedModules: ['EMPLOYEE_COMPLIANCE'],
          currentModules: [],
          status: 'PENDING_CCO',
          requestNote: 'Add payroll',
          reviewNote: null,
          requestedAt: new Date(),
          reviewedAt: null,
          requestedByName: 'Admin',
          reviewedByName: null,
        },
      ]);

      await service.createRequest(
        {
          clientId,
          packageCode: 'CUSTOM_SERVICES',
          modules: ['EMPLOYEE_COMPLIANCE'],
          note: '  Add payroll  ',
        },
        { id: adminUserId, userId: adminUserId } as any,
      );

      expect(manager.query.mock.calls[0][1][5]).toBe('Add payroll');
      expect(manager.query.mock.calls[1][1][5]).toBe('Add payroll');
    });

    it('rejects malformed requester ids before querying clients', async () => {
      await expect(
        service.createRequest(
          {
            clientId,
            packageCode: 'CUSTOM_SERVICES',
            modules: ['EMPLOYEE_COMPLIANCE'],
          },
          { id: 'not-a-uuid', userId: 'not-a-uuid' } as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(dataSource.query).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects malformed request client ids before querying clients', async () => {
      await expect(
        service.createRequest(
          {
            clientId: 'not-a-uuid',
            packageCode: 'CUSTOM_SERVICES',
            modules: ['EMPLOYEE_COMPLIANCE'],
          },
          { id: adminUserId, userId: adminUserId } as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(dataSource.query).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentForClient', () => {
    it('rejects malformed client ids before querying current entitlements', async () => {
      await expect(service.getCurrentForClient('not-a-uuid')).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('ignores unsupported stored entitlement module rows', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          { package_code: 'CUSTOM_SERVICES', approved_at: new Date() },
        ])
        .mockResolvedValueOnce([
          { module_code: 'EMPLOYEE_COMPLIANCE' },
          { module_code: 'UNKNOWN_MODULE' },
          { module_code: '' },
        ]);

      const result = await service.getCurrentForClient(clientId);

      expect(result).toEqual({
        packageCode: 'CUSTOM_SERVICES',
        enabledModules: ['EMPLOYEE_COMPLIANCE'],
        isRestricted: true,
      });
    });

    it('normalizes unsupported stored package codes to custom services', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          { package_code: 'OLD_PACKAGE', approved_at: new Date() },
        ])
        .mockResolvedValueOnce([{ module_code: 'EMPLOYEE_COMPLIANCE' }]);

      const result = await service.getCurrentForClient(clientId);

      expect(result).toEqual({
        packageCode: 'CUSTOM_SERVICES',
        enabledModules: ['EMPLOYEE_COMPLIANCE'],
        isRestricted: true,
      });
    });
  });

  describe('getClientStatus', () => {
    it('rejects malformed client ids before querying pending requests', async () => {
      await expect(service.getClientStatus('not-a-uuid')).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('includes pending request modules and note details', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          { package_code: 'CUSTOM_SERVICES', approved_at: new Date() },
        ])
        .mockResolvedValueOnce([{ module_code: 'EMPLOYEE_COMPLIANCE' }])
        .mockResolvedValueOnce([
          {
            id: 'request-1',
            packageCode: 'CUSTOM_SERVICES',
            requestedModules: '["EMPLOYEE_COMPLIANCE","CONTRACTOR_DOCUMENTS"]',
            requestNote: 'Add contractor documents',
            requestedAt: new Date('2026-06-26T10:00:00Z'),
          },
        ]);

      const result = await service.getClientStatus(clientId);

      expect(result.pendingRequests).toEqual([
        {
          id: 'request-1',
          packageCode: 'CUSTOM_SERVICES',
          requestedModules: ['EMPLOYEE_COMPLIANCE', 'CONTRACTOR_DOCUMENTS'],
          requestNote: 'Add contractor documents',
          requestedAt: new Date('2026-06-26T10:00:00Z'),
        },
      ]);
      expect(dataSource.query.mock.calls[2][0]).toContain('requested_modules');
      expect(dataSource.query.mock.calls[2][0]).toContain('request_note');
    });
  });
});
