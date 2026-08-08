import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SalesService } from './sales.service';
import { LeadEntity } from './entities/lead.entity';
import { LeadActivityEntity } from './entities/lead-activity.entity';

describe('SalesService', () => {
  let service: SalesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: DataSource, useValue: { query: jest.fn() } },
        {
          provide: getRepositoryToken(LeadEntity),
          useValue: { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(LeadActivityEntity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
