import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { RetentionCleanupCronService } from './retention-cleanup-cron.service';

describe('RetentionCleanupCronService', () => {
  let service: RetentionCleanupCronService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetentionCleanupCronService,
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
              manager: { query: jest.fn() },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RetentionCleanupCronService>(
      RetentionCleanupCronService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
