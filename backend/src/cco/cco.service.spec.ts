import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CcoService } from './cco.service';

describe('CcoService', () => {
  let service: CcoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CcoService,
        {
          provide: DataSource,
          useValue: {
            query: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<CcoService>(CcoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
