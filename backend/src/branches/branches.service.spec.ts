import { Test, TestingModule } from '@nestjs/testing';
import { BranchesService } from './branches.service';
import { getRepositoryToken } from '@nestjs/typeorm';
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
      ],
    }).compile();

    service = module.get<BranchesService>(BranchesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
