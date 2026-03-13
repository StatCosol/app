import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ApplicabilityEngineService } from './applicability-engine.service';
import { TaskGeneratorService } from './task-generator.service';

describe('ApplicabilityEngineService', () => {
  let service: ApplicabilityEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicabilityEngineService,
        {
          provide: DataSource,
          useValue: {
            getRepository: jest.fn().mockReturnValue({
              find: jest.fn().mockResolvedValue([]),
              findOne: jest.fn().mockResolvedValue(null),
              save: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
              createQueryBuilder: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([]),
              }),
            }),
            query: jest.fn(),
          },
        },
        { provide: TaskGeneratorService, useValue: { generate: jest.fn() } },
      ],
    }).compile();

    service = module.get<ApplicabilityEngineService>(
      ApplicabilityEngineService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
