import { Test, TestingModule } from '@nestjs/testing';
import { LegitxDashboardService } from './legitx-dashboard.service';
import { DbService } from '../common/db/db.service';

describe('LegitxDashboardService', () => {
  let service: LegitxDashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegitxDashboardService,
        {
          provide: DbService,
          useValue: { query: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<LegitxDashboardService>(LegitxDashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
