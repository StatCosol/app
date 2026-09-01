import { Test, TestingModule } from '@nestjs/testing';
import { BranchesService } from './branches.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ComplianceApplicabilityService } from '../compliances/compliance-applicability.service';

describe('BranchesService', () => {
  let service: BranchesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        {
          provide: getRepositoryToken(
            require('./entities/branch.entity').BranchEntity,
          ),
          useValue: {},
        },
        {
          provide: getRepositoryToken(
            require('./entities/branch-contractor.entity')
              .BranchContractorEntity,
          ),
          useValue: {},
        },
        {
          provide: getRepositoryToken(
            require('./entities/branch-applicable-compliance.entity')
              .BranchApplicableComplianceEntity,
          ),
          useValue: {},
        },
        {
          provide: getRepositoryToken(
            require('../compliances/entities/compliance-master.entity')
              .ComplianceMasterEntity,
          ),
          useValue: {},
        },
        {
          provide: getRepositoryToken(
            require('../admin/entities/approval-request.entity')
              .ApprovalRequestEntity,
          ),
          useValue: {},
        },
        {
          provide: require('../users/users.service').UsersService,
          useValue: {},
        },
        {
          provide: AuditLogsService,
          useValue: { log: jest.fn() },
        },
        {
          provide: ComplianceApplicabilityService,
          useValue: { recomputeForBranch: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: { query: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<BranchesService>(BranchesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('links an existing branch login to another branch without changing its password', async () => {
    const branchRepo = (service as any).branchRepo;
    const dataSource = (service as any).dataSource;
    branchRepo.findOne = jest.fn().mockResolvedValue({ id: 'branch-2' });
    dataSource.query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'user-1',
          clientId: 'client-1',
          userType: 'BRANCH',
          isActive: true,
          roleCode: 'CLIENT',
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await (service as any).createBranchUser(
      'client-1',
      'branch-2',
      'Unit Manager',
      'manager@example.com',
      '9000000000',
    );

    expect(result).toEqual({
      email: 'manager@example.com',
      password: null,
      userId: 'user-1',
      linkedExisting: true,
    });
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO user_branches'),
      ['user-1', 'branch-2'],
    );
  });

  it('links a branch user selected from the branch Users screen', async () => {
    const branchRepo = (service as any).branchRepo;
    const dataSource = (service as any).dataSource;
    branchRepo.findOne = jest
      .fn()
      .mockResolvedValue({ id: 'branch-2', clientId: 'client-1' });
    dataSource.query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'user-1',
          clientId: 'client-1',
          userType: 'BRANCH',
          isActive: true,
          roleCode: 'CLIENT',
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(service.addBranchUser('branch-2', 'user-1')).resolves.toEqual({
      message: 'Branch user linked',
      userId: 'user-1',
      branchId: 'branch-2',
    });
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO user_branches'),
      ['user-1', 'branch-2'],
    );
  });
});
