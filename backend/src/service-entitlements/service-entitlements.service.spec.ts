import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ServiceEntitlementsService } from './service-entitlements.service';

describe('ServiceEntitlementsService', () => {
  let dataSource: jest.Mocked<Pick<DataSource, 'query' | 'transaction'>>;
  let service: ServiceEntitlementsService;

  beforeEach(() => {
    dataSource = {
      query: jest.fn(),
      transaction: jest.fn(),
    };
    service = new ServiceEntitlementsService(dataSource as unknown as DataSource);
  });

  describe('normalizeModules', () => {
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
          clientId: 'client-1',
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
            { id: 'cco-1', userId: 'cco-1' } as any,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(dataSource.transaction).not.toHaveBeenCalled();
      },
    );
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

  describe('createRequest', () => {
    it('trims request notes before writing request and audit rows', async () => {
      const manager = {
        query: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'request-1' }])
          .mockResolvedValueOnce([]),
      };
      dataSource.query
        .mockResolvedValueOnce([{ id: 'client-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (dataSource.transaction as jest.Mock).mockImplementation(async (fn) =>
        fn(manager as any),
      );
      dataSource.query.mockResolvedValueOnce([
        {
          id: 'request-1',
          clientId: 'client-1',
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
          clientId: 'client-1',
          packageCode: 'CUSTOM_SERVICES',
          modules: ['EMPLOYEE_COMPLIANCE'],
          note: '  Add payroll  ',
        },
        { id: 'admin-1', userId: 'admin-1' } as any,
      );

      expect(manager.query.mock.calls[0][1][5]).toBe('Add payroll');
      expect(manager.query.mock.calls[1][1][5]).toBe('Add payroll');
    });
  });

  describe('getClientStatus', () => {
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
            requestedModules: ['EMPLOYEE_COMPLIANCE', 'CONTRACTOR_DOCUMENTS'],
            requestNote: 'Add contractor documents',
            requestedAt: new Date('2026-06-26T10:00:00Z'),
          },
        ]);

      const result = await service.getClientStatus('client-1');

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
