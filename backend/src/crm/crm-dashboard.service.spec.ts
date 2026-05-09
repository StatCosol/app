import { Test, TestingModule } from '@nestjs/testing';
import { CrmDashboardService } from './crm-dashboard.service';
import { DbService } from '../common/db/db.service';

describe('CrmDashboardService', () => {
  let service: CrmDashboardService;

  const mockDb = {
    query: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmDashboardService,
        { provide: DbService, useValue: mockDb },
      ],
    }).compile();

    service = module.get<CrmDashboardService>(CrmDashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
