import { Test, TestingModule } from '@nestjs/testing';
import { CompliancesService } from './compliances.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

describe('CompliancesService', () => {
  let service: CompliancesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompliancesService,
        {
          provide: getRepositoryToken(
            require('./entities/compliance-master.entity')
              .ComplianceMasterEntity,
          ),
          useValue: {},
        },
        {
          provide: getRepositoryToken(
            require('./entities/compliance-applicability.entity')
              .ComplianceApplicabilityEntity,
          ),
          useValue: {},
        },
        {
          provide: getRepositoryToken(
            require('../checklists/entities/branch-compliance.entity')
              .BranchComplianceEntity,
          ),
          useValue: {},
        },
        {
          provide: getRepositoryToken(
            require('../branches/entities/branch.entity').BranchEntity,
          ),
          useValue: {},
        },
        {
          provide: require('../assignments/assignments.service')
            .AssignmentsService,
          useValue: {},
        },
        {
          provide: DataSource,
          useValue: { transaction: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<CompliancesService>(CompliancesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
