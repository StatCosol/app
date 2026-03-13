import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApplicabilityEngineService } from './applicability-engine.service';
import { UnitFactsEntity } from '../entities/unit-facts.entity';
import { UnitApplicableComplianceEntity } from '../entities/unit-applicable-compliance.entity';
import { UnitApplicabilityAuditEntity } from '../entities/unit-applicability-audit.entity';
import { PackageComplianceEntity } from '../../masters/entities/package-compliance.entity';
import { PackageRuleEntity } from '../../masters/entities/package-rule.entity';
import { ApplicabilityRuleEntity } from '../../masters/entities/applicability-rule.entity';
import { CompliancePackageEntity } from '../../masters/entities/compliance-package.entity';
import { RuleEvaluatorService } from './rule-evaluator.service';

describe('ApplicabilityEngineService (units)', () => {
  let service: ApplicabilityEngineService;

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
        ApplicabilityEngineService,
        {
          provide: getRepositoryToken(UnitFactsEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(UnitApplicableComplianceEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(UnitApplicabilityAuditEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(PackageComplianceEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(PackageRuleEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(ApplicabilityRuleEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(CompliancePackageEntity),
          useValue: { ...mockRepo },
        },
        { provide: RuleEvaluatorService, useValue: { evaluate: jest.fn() } },
      ],
    }).compile();

    service = module.get<ApplicabilityEngineService>(
      ApplicabilityEngineService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
