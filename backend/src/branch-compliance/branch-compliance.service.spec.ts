import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BranchComplianceService } from './branch-compliance.service';
import { ComplianceDocumentEntity } from './entities/compliance-document.entity';
import { ComplianceReturnMasterEntity } from './entities/compliance-return-master.entity';
import { BranchAccessService } from '../auth/branch-access.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { RejectionMailService } from '../email/rejection-mail.service';

describe('BranchComplianceService', () => {
  let service: BranchComplianceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchComplianceService,
        {
          provide: getRepositoryToken(ComplianceDocumentEntity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(ComplianceReturnMasterEntity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        { provide: BranchAccessService, useValue: {} },
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: AuditLogsService, useValue: { log: jest.fn() } },
        { provide: RejectionMailService, useValue: {} },
      ],
    }).compile();

    service = module.get<BranchComplianceService>(BranchComplianceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
