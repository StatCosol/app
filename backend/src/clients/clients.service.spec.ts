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
});
