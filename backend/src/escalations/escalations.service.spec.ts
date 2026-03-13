import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EscalationsService } from './escalations.service';
import { EscalationEntity } from './entities/escalation.entity';

describe('EscalationsService', () => {
  let service: EscalationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscalationsService,
        {
          provide: getRepositoryToken(EscalationEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn().mockResolvedValue({}),
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

    service = module.get<EscalationsService>(EscalationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
