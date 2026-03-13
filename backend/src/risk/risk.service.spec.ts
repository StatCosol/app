import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { RiskService } from './risk.service';

describe('RiskService', () => {
  let service: RiskService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskService,
        {
          provide: DataSource,
          useValue: {
            query: jest.fn().mockResolvedValue([]),
            createQueryRunner: jest.fn().mockReturnValue({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RiskService>(RiskService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
