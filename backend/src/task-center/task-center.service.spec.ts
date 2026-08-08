import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TaskCenterService } from './task-center.service';

describe('TaskCenterService', () => {
  let service: TaskCenterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCenterService,
        {
          provide: DataSource,
          useValue: {
            query: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<TaskCenterService>(TaskCenterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
