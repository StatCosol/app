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
});
