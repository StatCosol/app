import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ReturnListService } from './return-list.service';
import { AccessScopeService } from '../access/access-scope.service';

describe('ReturnListService', () => {
  let service: ReturnListService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnListService,
        {
          provide: DataSource,
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              leftJoin: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              offset: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              getRawMany: jest.fn().mockResolvedValue([]),
              getRawOne: jest.fn().mockResolvedValue({ count: '0' }),
            }),
          },
        },
        {
          provide: AccessScopeService,
          useValue: {
            applyScopeFilter: jest.fn(),
            getBranchIds: jest.fn().mockReturnValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<ReturnListService>(ReturnListService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
