import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ThresholdResolverService } from './threshold-resolver.service';
import { ThresholdMasterEntity } from '../entities/threshold-master.entity';

describe('ThresholdResolverService', () => {
  let service: ThresholdResolverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThresholdResolverService,
        {
          provide: getRepositoryToken(ThresholdMasterEntity),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              addOrderBy: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(null),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ThresholdResolverService>(ThresholdResolverService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
