import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AdminActionsService } from './admin-actions.service';

describe('AdminActionsService', () => {
  let service: AdminActionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminActionsService,
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
              query: jest.fn().mockResolvedValue([]),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AdminActionsService>(AdminActionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
