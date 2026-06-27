import { Test, TestingModule } from '@nestjs/testing';
import { ClientsService } from './clients.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClientEntity } from './entities/client.entity';
import { UsersService } from '../users/users.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';

describe('ClientsService', () => {
  let service: ClientsService;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    }),
    manager: {
      getRepository: jest.fn(),
    },
  };

  const mockUsersService = {
    getUserRoleCode: jest.fn(),
  };

  const mockAuditLogsService = {
    log: jest.fn(),
  };

  const mockDataSource = {
    query: jest.fn(),
    createQueryRunner: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: getRepositoryToken(ClientEntity), useValue: mockRepo },
        {
          provide: getRepositoryToken(
            require('./entities/client-user.entity').ClientUserEntity,
          ),
          useValue: {},
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('service package selection', () => {
    const normalize = (dto: any) =>
      (service as any).normalizeRequestedServiceModules(dto);

    it('deduplicates valid requested service modules', () => {
      expect(
        normalize({
          servicePackageCode: 'CUSTOM_SERVICES',
          serviceModules: [
            'EMPLOYEE_COMPLIANCE',
            'EMPLOYEE_COMPLIANCE',
            'PAYROLL',
          ],
          servicePackageNote: '  Initial request  ',
        }),
      ).toEqual({
        packageCode: 'CUSTOM_SERVICES',
        modules: ['EMPLOYEE_COMPLIANCE', 'PAYROLL'],
        note: 'Initial request',
      });
    });

    it('uses package modules when no explicit module list is supplied', () => {
      expect(
        normalize({
          servicePackageCode: 'CONTRACTOR_AUDIT_ONLY',
        }),
      ).toEqual({
        packageCode: 'CONTRACTOR_AUDIT_ONLY',
        modules: [
          'CONTRACTOR_AUDIT',
          'CONTRACTOR_PORTAL',
          'CONTRACTOR_DOCUMENTS',
          'CONTRACTOR_ATTENDANCE',
          'CONTRACTOR_FACE_ATTENDANCE',
        ],
        note: 'Initial service selection during client registration',
      });
    });

    it('allows fixed packages when explicit modules match the package definition', () => {
      expect(
        normalize({
          servicePackageCode: 'CONTRACTOR_AUDIT_ONLY',
          serviceModules: [
            'CONTRACTOR_AUDIT',
            'CONTRACTOR_PORTAL',
            'CONTRACTOR_DOCUMENTS',
            'CONTRACTOR_ATTENDANCE',
            'CONTRACTOR_FACE_ATTENDANCE',
          ],
        }),
      ).toEqual({
        packageCode: 'CONTRACTOR_AUDIT_ONLY',
        modules: [
          'CONTRACTOR_AUDIT',
          'CONTRACTOR_PORTAL',
          'CONTRACTOR_DOCUMENTS',
          'CONTRACTOR_ATTENDANCE',
          'CONTRACTOR_FACE_ATTENDANCE',
        ],
        note: 'Initial service selection during client registration',
      });
    });

    it('rejects custom module selections for fixed service packages', () => {
      expect(() =>
        normalize({
          servicePackageCode: 'CONTRACTOR_AUDIT_ONLY',
          serviceModules: ['CONTRACTOR_AUDIT'],
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects unsupported requested service modules instead of dropping them', () => {
      expect(() =>
        normalize({
          servicePackageCode: 'CUSTOM_SERVICES',
          serviceModules: ['EMPLOYEE_COMPLIANCE', 'OLD_MODULE'],
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        normalize({
          servicePackageCode: 'CUSTOM_SERVICES',
          serviceModules: ['EMPLOYEE_COMPLIANCE', null],
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('create', () => {
    it('rejects malformed service request actor ids before saving clients', async () => {
      await expect(
        service.create(
          {
            clientName: 'Acme Ltd',
            servicePackageCode: 'CUSTOM_SERVICES',
            serviceModules: ['EMPLOYEE_COMPLIANCE'],
          } as any,
          'not-a-uuid',
          'ADMIN',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(mockRepo.save).not.toHaveBeenCalled();
      expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
    });
  });

  describe('listClients', () => {
    it('does not expose enabled modules for unapproved fixed service packages', async () => {
      const client = {
        id: '33333333-3333-4333-8333-333333333333',
        clientName: 'Acme Ltd',
      };
      mockRepo.createQueryBuilder.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([client]),
      } as any);
      (mockRepo.manager.getRepository as jest.Mock).mockReturnValueOnce({
        createQueryBuilder: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          groupBy: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([]),
        }),
      });
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            clientId: client.id,
            packageCode: 'CONTRACTOR_AUDIT_ONLY',
            approvedAt: null,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            clientId: client.id,
            requestId: '44444444-4444-4444-8444-444444444444',
            status: 'PENDING_CCO',
          },
        ]);

      const result = await service.listClients();

      expect(result[0]).toEqual(
        expect.objectContaining({
          servicePackage: 'CONTRACTOR_AUDIT_ONLY',
          enabledModules: [],
          pendingServiceRequestId: '44444444-4444-4444-8444-444444444444',
          servicePackageStatus: 'PENDING_CCO',
        }),
      );
    });
  });
});
