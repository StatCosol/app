import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChecklistsService } from './checklists.service';
import { BranchComplianceEntity } from './entities/branch-compliance.entity';

describe('ChecklistsService', () => {
  let service: ChecklistsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChecklistsService,
        {
          provide: getRepositoryToken(BranchComplianceEntity),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([]),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ChecklistsService>(ChecklistsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
