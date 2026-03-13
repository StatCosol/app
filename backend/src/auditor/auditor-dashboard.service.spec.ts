import { Test, TestingModule } from '@nestjs/testing';
import { AuditorDashboardService } from './auditor-dashboard.service';
import { DbService } from '../common/db/db.service';

describe('AuditorDashboardService', () => {
  let service: AuditorDashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditorDashboardService,
        {
          provide: DbService,
          useValue: { query: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<AuditorDashboardService>(AuditorDashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
