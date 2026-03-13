import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiCostTrackingService } from './ai-cost-tracking.service';
import { AiUsageLogEntity } from './entities/ai-usage-log.entity';

describe('AiCostTrackingService', () => {
  let service: AiCostTrackingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiCostTrackingService,
        {
          provide: getRepositoryToken(AiUsageLogEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AiCostTrackingService>(AiCostTrackingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
