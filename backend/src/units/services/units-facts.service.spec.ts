import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnitsFactsService } from './units-facts.service';
import { UnitFactsEntity } from '../entities/unit-facts.entity';

describe('UnitFactsService', () => {
  let service: UnitsFactsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnitsFactsService,
        {
          provide: getRepositoryToken(UnitFactsEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UnitsFactsService>(UnitsFactsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
