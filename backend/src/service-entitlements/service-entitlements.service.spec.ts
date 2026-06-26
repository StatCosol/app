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
