import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditsService } from './audits.service';
import { AuditEntity } from './entities/audit.entity';
import { AuditObservationEntity } from './entities/audit-observation.entity';
import { AuditChecklistItemEntity } from './entities/audit-checklist-item.entity';
import { AuditDocumentReviewEntity } from './entities/audit-document-review.entity';
import { AuditNonComplianceEntity } from './entities/audit-non-compliance.entity';
import { AuditResubmissionEntity } from './entities/audit-resubmission.entity';
import { ClientsService } from '../clients/clients.service';
import { UsersService } from '../users/users.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NonComplianceEngineService } from '../automation/services/non-compliance-engine.service';
import { AuditOutputEngineService } from '../automation/services/audit-output-engine.service';
import { RejectionMailService } from '../email/rejection-mail.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditNcService } from './audit-nc.service';
import { AuditChecklistService } from './audit-checklist.service';
import { AuditAuditorDashboardService } from './audit-auditor-dashboard.service';
import { AuditReportService } from './audit-report.service';
import { AuditListingService } from './audit-listing.service';
import { AuditDocumentReviewService } from './audit-document-review.service';

const delegateMock = () => ({});

const repoMock = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  save: jest.fn(),
  create: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
  }),
});

describe('AuditsService', () => {
  let service: AuditsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditsService,
        { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(AuditEntity), useValue: repoMock() },
        { provide: getRepositoryToken(AuditObservationEntity), useValue: repoMock() },
        { provide: getRepositoryToken(AuditChecklistItemEntity), useValue: repoMock() },
        { provide: getRepositoryToken(AuditDocumentReviewEntity), useValue: repoMock() },
        { provide: getRepositoryToken(AuditNonComplianceEntity), useValue: repoMock() },
        { provide: getRepositoryToken(AuditResubmissionEntity), useValue: repoMock() },
        { provide: ClientsService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: AssignmentsService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: NonComplianceEngineService, useValue: {} },
        { provide: AuditOutputEngineService, useValue: {} },
        { provide: RejectionMailService, useValue: {} },
        { provide: AuditLogsService, useValue: { log: jest.fn() } },
        { provide: AuditNcService, useValue: delegateMock() },
        { provide: AuditChecklistService, useValue: delegateMock() },
        { provide: AuditAuditorDashboardService, useValue: delegateMock() },
        { provide: AuditReportService, useValue: delegateMock() },
        { provide: AuditListingService, useValue: delegateMock() },
        { provide: AuditDocumentReviewService, useValue: delegateMock() },
      ],
    }).compile();

    service = module.get<AuditsService>(AuditsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
