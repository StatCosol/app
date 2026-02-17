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
});
