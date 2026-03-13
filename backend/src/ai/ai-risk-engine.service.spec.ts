import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AiRiskEngineService } from './ai-risk-engine.service';
import { AiRiskAssessmentEntity } from './entities/ai-risk-assessment.entity';
import { AiInsightEntity } from './entities/ai-insight.entity';
import { AiCoreService } from './ai-core.service';
import { AiRequestLogService } from './ai-request-log.service';

describe('AiRiskEngineService', () => {
  let service: AiRiskEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiRiskEngineService,
        {
          provide: getRepositoryToken(AiRiskAssessmentEntity),
          useValue: { find: jest.fn().mockResolvedValue([]), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(AiInsightEntity),
          useValue: { find: jest.fn().mockResolvedValue([]), save: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: { query: jest.fn().mockResolvedValue([]) },
        },
        { provide: AiCoreService, useValue: { complete: jest.fn() } },
        { provide: AiRequestLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<AiRiskEngineService>(AiRiskEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
