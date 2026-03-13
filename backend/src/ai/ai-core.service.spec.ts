import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiCoreService } from './ai-core.service';
import { AiConfigurationEntity } from './entities/ai-configuration.entity';
import { AiCostTrackingService } from './ai-cost-tracking.service';

describe('AiCoreService', () => {
  let service: AiCoreService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiCoreService,
        {
          provide: getRepositoryToken(AiConfigurationEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
        { provide: AiCostTrackingService, useValue: { track: jest.fn() } },
      ],
    }).compile();

    service = module.get<AiCoreService>(AiCoreService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
