import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReturnsService } from './returns.service';
import { ComplianceReturnEntity } from './entities/compliance-return.entity';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { BranchAccessService } from '../auth/branch-access.service';

describe('ReturnsService', () => {
  let service: ReturnsService;

  const mockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockReturnValue({}),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnsService,
        {
          provide: getRepositoryToken(ComplianceReturnEntity),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(ClientAssignmentCurrentEntity),
          useValue: mockRepo(),
        },
        {
          provide: BranchAccessService,
          useValue: { getAllowedBranchIds: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<ReturnsService>(ReturnsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
