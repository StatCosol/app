import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MonthlyDocumentsService } from './monthly-documents.service';
import { MonthlyComplianceUploadEntity } from './entities/monthly-compliance-upload.entity';
import { BranchAccessService } from '../auth/branch-access.service';

describe('MonthlyDocumentsService', () => {
  let service: MonthlyDocumentsService;

  const mockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockReturnValue({}),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonthlyDocumentsService,
        {
          provide: getRepositoryToken(MonthlyComplianceUploadEntity),
          useValue: mockRepo(),
        },
        {
          provide: BranchAccessService,
          useValue: { getAllowedBranchIds: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<MonthlyDocumentsService>(MonthlyDocumentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
