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
  let audits: ReturnType<typeof repoMock>;
  let checklist: ReturnType<typeof repoMock>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditsService,
        {
          provide: DataSource,
          useValue: { query: jest.fn().mockResolvedValue([]) },
        },
        { provide: getRepositoryToken(AuditEntity), useValue: repoMock() },
        {
          provide: getRepositoryToken(AuditObservationEntity),
          useValue: repoMock(),
        },
        {
          provide: getRepositoryToken(AuditChecklistItemEntity),
          useValue: repoMock(),
        },
        {
          provide: getRepositoryToken(AuditDocumentReviewEntity),
          useValue: repoMock(),
        },
        {
          provide: getRepositoryToken(AuditNonComplianceEntity),
          useValue: repoMock(),
        },
        {
          provide: getRepositoryToken(AuditResubmissionEntity),
          useValue: repoMock(),
        },
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
    audits = module.get(getRepositoryToken(AuditEntity));
    checklist = module.get(getRepositoryToken(AuditChecklistItemEntity));
  });

  const user = { userId: 'auditor', roleCode: 'AUDITOR' } as any;
  it('requires generated remarks to be cross-checked and preserves manual remarks', async () => {
    audits.findOne.mockResolvedValue({
      assignedAuditorId: 'auditor',
      status: 'IN_PROGRESS',
    });
    const item = {
      status: 'PENDING',
      automatedRemarks: 'Document suggested note',
      remarks: 'Manual note',
      automationReviewed: false,
    };
    checklist.findOne.mockResolvedValue(item);
    await expect(
      service.updateChecklistItem(user, 'audit', 'item', {
        status: 'COMPLIED',
      }),
    ).rejects.toThrow('generated');
    expect(checklist.save).not.toHaveBeenCalled();
    await service.updateChecklistItem(user, 'audit', 'item', {
      status: 'COMPLIED',
      automationReviewed: true,
    });
    expect(checklist.save).toHaveBeenCalledWith(
      expect.objectContaining({
        remarks: 'Manual note',
        automationReviewed: true,
        status: 'COMPLIED',
      }),
    );
  });
  it('requires a reason for noncompliance and keeps closed audits read-only', async () => {
    audits.findOne.mockResolvedValue({
      assignedAuditorId: 'auditor',
      status: 'IN_PROGRESS',
    });
    checklist.findOne.mockResolvedValue({ status: 'PENDING' });
    await expect(
      service.updateChecklistItem(user, 'audit', 'item', {
        status: 'NOT_APPLICABLE',
        remarks: ' ',
      }),
    ).rejects.toThrow('explaining');
    audits.findOne.mockResolvedValue({
      assignedAuditorId: 'auditor',
      status: 'CLOSED',
    });
    await expect(
      service.updateChecklistItem(user, 'audit', 'item', {
        status: 'COMPLIED',
      }),
    ).rejects.toThrow('read-only');
    expect(checklist.save).not.toHaveBeenCalled();
  });
  it.each([
    [],
    [{ status: 'PENDING' }],
    [{ status: 'UPLOADED' }],
    [
      {
        status: 'COMPLIED',
        automatedRemarks: 'Check this',
        automationReviewed: false,
      },
    ],
  ])('blocks submission with an incomplete checklist %j', async (...args) => {
    audits.findOne.mockResolvedValue({
      assignedAuditorId: 'auditor',
      status: 'IN_PROGRESS',
    });
    checklist.find.mockResolvedValue(
      args.filter((x) => x && typeof x === 'object'),
    );
    await expect(service.submitAudit(user, 'audit')).rejects.toThrow(
      'Complete the audit checklist',
    );
  });
  it('should be defined', () => {
    expect(service).toBeDefined();
  });
  it('uses the fieldwork blend when the standard Mark Completed action is used', async () => {
    audits.findOne.mockResolvedValue({
      id: 'audit',
      assignedAuditorId: 'auditor',
      status: 'IN_PROGRESS',
    });
    audits.save.mockImplementation(async (a) => a);
    checklist.find.mockResolvedValue([{ status: 'COMPLIED' }]);
    (service as any).reportService.getLatestReportRow = jest
      .fn()
      .mockResolvedValue({ status: 'SUBMITTED' });
    (service as any).observationRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    });
    (service as any).dataSource.query.mockImplementation(async (sql: string) =>
      sql.includes('AS managed')
        ? [{ managed: true, total: 2, complied: 2, nonComplied: 0 }]
        : [],
    );
    jest
      .spyOn(service, 'calculateScore')
      .mockResolvedValue({
        score: 80,
        breakdown: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      });
    const result = await service.updateStatus(user, 'audit', 'COMPLETED');
    expect(result.score).toBe(90);
    expect(audits.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'COMPLETED', score: 90 }),
    );
  });
});
