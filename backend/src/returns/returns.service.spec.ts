import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { ComplianceReturnEntity } from './entities/compliance-return.entity';
import { ComplianceReturnMasterEntity } from '../branch-compliance/entities/compliance-return-master.entity';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { BranchAccessService } from '../auth/branch-access.service';
import { ReqUser } from '../access/access-scope.service';
import { DataSource } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ComplianceNotificationCenterService } from './services/compliance-notification-center.service';

describe('ReturnsService', () => {
  let service: ReturnsService;
  let returnsRepo: any;
  let masterRepo: any;
  let assignmentsRepo: any;
  let branchRepo: any;

  const mockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest
      .fn()
      .mockImplementation((e) => Promise.resolve({ id: 'new-id', ...e })),
    create: jest.fn().mockImplementation((e) => e),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  });

  const crmUser: ReqUser = {
    id: 'crm-1',
    userId: 'crm-1',
    roleCode: 'CRM',
    email: 'crm@example.com',
    clientId: 'c1',
    userType: null,
    employeeId: null,
    branchIds: [],
    assignedClientIds: ['c1'],
  };

  beforeEach(async () => {
    returnsRepo = mockRepo();
    masterRepo = mockRepo();
    assignmentsRepo = mockRepo();
    branchRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnsService,
        {
          provide: getRepositoryToken(ComplianceReturnEntity),
          useValue: returnsRepo,
        },
        {
          provide: getRepositoryToken(ComplianceReturnMasterEntity),
          useValue: masterRepo,
        },
        {
          provide: getRepositoryToken(ClientAssignmentCurrentEntity),
          useValue: assignmentsRepo,
        },
        { provide: getRepositoryToken(BranchEntity), useValue: branchRepo },
        {
          provide: BranchAccessService,
          useValue: {
            getAllowedBranchIds: jest.fn().mockResolvedValue([]),
            assertBranchUserOnly: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: DataSource, useValue: { query: jest.fn() } },
        {
          provide: AuditLogsService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
            logApproval: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ComplianceNotificationCenterService,
          useValue: { createNotification: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ReturnsService>(ReturnsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── createForCrm ──

  describe('createForCrm', () => {
    const baseDto = {
      clientId: 'c1',
      branchId: 'b1',
      lawType: 'GST',
      returnType: 'GSTR1',
      periodYear: 2026,
      periodMonth: 3,
    };

    it('rejects when CRM is not assigned to client', async () => {
      assignmentsRepo.findOne.mockResolvedValue(null);
      await expect(service.createForCrm(crmUser, baseDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects when branchId does not belong to clientId', async () => {
      assignmentsRepo.findOne.mockResolvedValue({ id: 'a1' });
      branchRepo.findOne.mockResolvedValue({
        id: 'b1',
        clientId: 'other-client',
      });
      returnsRepo.findOne.mockResolvedValue(null); // no duplicate

      await expect(service.createForCrm(crmUser, baseDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects duplicate filing for same client/branch/return/period', async () => {
      assignmentsRepo.findOne.mockResolvedValue({ id: 'a1' });
      branchRepo.findOne.mockResolvedValue({ id: 'b1', clientId: 'c1' });
      returnsRepo.findOne.mockResolvedValue({ id: 'existing' }); // duplicate
      masterRepo.findOne.mockResolvedValue({
        returnCode: 'GSTR1',
        dueDay: 20,
        isActive: true,
      });

      await expect(service.createForCrm(crmUser, baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates filing when all checks pass', async () => {
      assignmentsRepo.findOne.mockResolvedValue({ id: 'a1' });
      branchRepo.findOne.mockResolvedValue({ id: 'b1', clientId: 'c1' });
      returnsRepo.findOne.mockResolvedValue(null); // no duplicate
      masterRepo.findOne.mockResolvedValue({
        returnCode: 'GSTR1',
        dueDay: 20,
        isActive: true,
      });

      const result = await service.createForCrm(crmUser, baseDto);
      expect(returnsRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  // ── updateStatusAsCrm ──

  describe('updateStatusAsCrm', () => {
    it('rejects SUBMITTED without challan proof', async () => {
      const rec = {
        id: 'r1',
        clientId: 'c1',
        status: 'IN_PROGRESS' as const,
        challanFilePath: null,
        ackFilePath: null,
        ackNumber: null,
        isDeleted: false,
      };
      returnsRepo.findOne.mockResolvedValue(rec);
      assignmentsRepo.findOne.mockResolvedValue({ id: 'a1' });

      await expect(
        service.updateStatusAsCrm(crmUser, 'r1', { status: 'SUBMITTED' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows SUBMITTED when challan proof is present', async () => {
      const rec = {
        id: 'r1',
        clientId: 'c1',
        status: 'IN_PROGRESS' as const,
        challanFilePath: '/uploads/returns/challan.pdf',
        ackFilePath: null,
        ackNumber: null,
        isDeleted: false,
        filedDate: null,
      };
      returnsRepo.findOne.mockResolvedValue(rec);
      assignmentsRepo.findOne.mockResolvedValue({ id: 'a1' });

      await service.updateStatusAsCrm(crmUser, 'r1', { status: 'SUBMITTED' });
      expect(returnsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'SUBMITTED' }),
      );
    });

    it('rejects APPROVED without ACK proof', async () => {
      const rec = {
        id: 'r1',
        clientId: 'c1',
        status: 'SUBMITTED' as const,
        challanFilePath: '/uploads/returns/challan.pdf',
        ackFilePath: null,
        ackNumber: 'ACK123',
        isDeleted: false,
      };
      returnsRepo.findOne.mockResolvedValue(rec);
      assignmentsRepo.findOne.mockResolvedValue({ id: 'a1' });

      await expect(
        service.updateStatusAsCrm(crmUser, 'r1', { status: 'APPROVED' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects APPROVED without ACK number', async () => {
      const rec = {
        id: 'r1',
        clientId: 'c1',
        status: 'SUBMITTED' as const,
        challanFilePath: '/uploads/returns/challan.pdf',
        ackFilePath: '/uploads/returns/ack.pdf',
        ackNumber: null,
        isDeleted: false,
      };
      returnsRepo.findOne.mockResolvedValue(rec);
      assignmentsRepo.findOne.mockResolvedValue({ id: 'a1' });

      await expect(
        service.updateStatusAsCrm(crmUser, 'r1', { status: 'APPROVED' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows APPROVED when ACK proof and ACK number are present', async () => {
      const rec = {
        id: 'r1',
        clientId: 'c1',
        status: 'SUBMITTED' as const,
        challanFilePath: '/uploads/returns/challan.pdf',
        ackFilePath: '/uploads/returns/ack.pdf',
        ackNumber: 'ACK123',
        isDeleted: false,
        filedDate: null,
      };
      returnsRepo.findOne.mockResolvedValue(rec);
      assignmentsRepo.findOne.mockResolvedValue({ id: 'a1' });

      await service.updateStatusAsCrm(crmUser, 'r1', { status: 'APPROVED' });
      expect(returnsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'APPROVED' }),
      );
    });

    it('rejects invalid status transitions', async () => {
      const rec = {
        id: 'r1',
        clientId: 'c1',
        status: 'APPROVED' as const,
        challanFilePath: '/path',
        ackFilePath: '/path',
        ackNumber: 'ACK',
        isDeleted: false,
      };
      returnsRepo.findOne.mockResolvedValue(rec);
      assignmentsRepo.findOne.mockResolvedValue({ id: 'a1' });

      await expect(
        service.updateStatusAsCrm(crmUser, 'r1', { status: 'PENDING' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── resolveDueDate (non-monthly fallback) ──

  describe('resolveDueDate via createForCrm', () => {
    it('generates fiscal-year-end fallback for non-monthly returns', async () => {
      assignmentsRepo.findOne.mockResolvedValue({ id: 'a1' });
      branchRepo.findOne.mockResolvedValue({ id: 'b1', clientId: 'c1' });
      returnsRepo.findOne.mockResolvedValue(null);
      masterRepo.findOne.mockResolvedValue({
        returnCode: 'ANNUAL',
        dueDay: 15,
        isActive: true,
      });

      const dto = {
        clientId: 'c1',
        branchId: 'b1',
        lawType: 'PF',
        returnType: 'ANNUAL',
        periodYear: 2025,
        periodMonth: null as number | null,
      };

      await service.createForCrm(crmUser, dto);

      const created = returnsRepo.create.mock.calls[0][0];
      // Non-monthly: should get fiscal-year-end fallback = 2026-03-15
      expect(created.dueDate).toBe('2026-03-15');
    });
  });
});
