import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogEntity } from './entities/audit-log.entity';
import { TaskApprovalHistoryEntity } from './entities/task-approval-history.entity';

describe('AuditLogsService', () => {
  let service: AuditLogsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogsService,
        {
          provide: getRepositoryToken(AuditLogEntity),
          useValue: { save: jest.fn().mockResolvedValue({}), create: jest.fn() },
        },
        {
          provide: getRepositoryToken(TaskApprovalHistoryEntity),
          useValue: { save: jest.fn().mockResolvedValue({}), create: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuditLogsService>(AuditLogsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
