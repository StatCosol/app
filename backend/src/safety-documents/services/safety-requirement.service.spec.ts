import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SafetyRequirementService } from './safety-requirement.service';
import { BranchSafetyUploadEntity } from '../entities/branch-safety-upload.entity';
import { UnitFactsEntity } from '../../units/entities/unit-facts.entity';

describe('SafetyRequirementService', () => {
  let service: SafetyRequirementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafetyRequirementService,
        {
          provide: getRepositoryToken(BranchSafetyUploadEntity),
          useValue: { find: jest.fn().mockResolvedValue([]), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(UnitFactsEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SafetyRequirementService>(SafetyRequirementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
