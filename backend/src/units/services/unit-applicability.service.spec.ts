import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnitApplicabilityService } from './unit-applicability.service';
import { UnitApplicableComplianceEntity } from '../entities/unit-applicable-compliance.entity';
import { UnitApplicabilityAuditEntity } from '../entities/unit-applicability-audit.entity';
import { UnitComplianceMasterEntity } from '../../masters/entities/unit-compliance-master.entity';

describe('UnitApplicabilityService', () => {
  let service: UnitApplicabilityService;

  const mockRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnitApplicabilityService,
        {
          provide: getRepositoryToken(UnitApplicableComplianceEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(UnitApplicabilityAuditEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(UnitComplianceMasterEntity),
          useValue: { ...mockRepo },
        },
      ],
    }).compile();

    service = module.get<UnitApplicabilityService>(UnitApplicabilityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
