import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiCoreService } from './ai-core.service';
import { AiConfigurationEntity } from './entities/ai-configuration.entity';
import { AiCostTrackingService } from './ai-cost-tracking.service';
import { ConfigService } from '@nestjs/config';

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
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (_key: string, defaultValue?: unknown) => defaultValue,
            ),
          },
        },
      ],
    }).compile();

    service = module.get<AiCoreService>(AiCoreService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
