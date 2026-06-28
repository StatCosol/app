import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AttendanceService } from './attendance.service';
import { AttendanceEntity } from './entities/attendance.entity';
import { AttendanceMismatchEntity } from './entities/attendance-mismatch.entity';
import { AttendanceAuditLogEntity } from './entities/attendance-audit-log.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { BiometricService } from '../biometric/biometric.service';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let biometricService: { processRange: jest.Mock };

  const mockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockReturnValue({}),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  });

  beforeEach(async () => {
    biometricService = {
      processRange: jest.fn().mockResolvedValue({ attendanceUpserts: 0 }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: getRepositoryToken(AttendanceEntity), useValue: mockRepo() },
        { provide: getRepositoryToken(EmployeeEntity), useValue: mockRepo() },
        { provide: getRepositoryToken(AttendanceMismatchEntity), useValue: mockRepo() },
        { provide: getRepositoryToken(AttendanceAuditLogEntity), useValue: mockRepo() },
        { provide: DataSource, useValue: {} },
        { provide: BiometricService, useValue: biometricService },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('reprocesses all biometric punches before listing daily attendance', async () => {
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    (service as any).ds = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

    await service.listDaily({ clientId: 'client-1', date: '2026-05-28' });

    expect(biometricService.processRange).toHaveBeenCalledWith(
      'client-1',
      '2026-05-28',
      '2026-05-28',
      true,
    );
    expect(qb.getRawMany).toHaveBeenCalled();
  });

  it('processes unprocessed biometric punches before range listing', async () => {
    await service.list({
      clientId: 'client-1',
      from: '2026-05-01',
      to: '2026-05-31',
    });

    expect(biometricService.processRange).toHaveBeenCalledWith(
      'client-1',
      '2026-05-01',
      '2026-05-31',
      false,
    );
  });

  it('reprocesses all biometric punches before returning daily approval stats', async () => {
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    (service as any).repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await service.getApprovalStats('client-1', '2026-05-28');

    expect(biometricService.processRange).toHaveBeenCalledWith(
      'client-1',
      '2026-05-28',
      '2026-05-28',
      true,
    );
  });

  it('resets approval metadata when an existing attendance row is marked again', async () => {
    const existing = {
      id: 'att-1',
      clientId: 'client-1',
      branchId: 'branch-1',
      employeeId: 'emp-1',
      date: '2026-05-28',
      status: 'PRESENT',
      approvalStatus: 'APPROVED',
      approvedByUserId: 'approver-1',
      approvedAt: new Date('2026-05-29T00:00:00.000Z'),
      rejectionReason: null,
    };
    (service as any).empRepo.findOne = jest.fn().mockResolvedValue({
      id: 'emp-1',
      clientId: 'client-1',
      branchId: 'branch-1',
      employeeCode: 'E001',
    });
    (service as any).repo.findOne = jest.fn().mockResolvedValue(existing);
    (service as any).repo.save = jest.fn(async (row: any) => row);

    const saved = await service.markAttendance('client-1', {
      employeeId: 'emp-1',
      date: '2026-05-28',
      status: 'ABSENT',
    });

    expect(saved.approvalStatus).toBe('PENDING');
    expect(saved.approvedByUserId).toBeNull();
    expect(saved.approvedAt).toBeNull();
    expect(saved.rejectionReason).toBeNull();
  });

  it('blocks branch-scoped approval for attendance outside the user branch', async () => {
    (service as any).repo.find = jest.fn().mockResolvedValue([
      {
        id: 'att-1',
        clientId: 'client-1',
        branchId: 'branch-2',
      },
    ]);

    await expect(
      service.approveRecords('client-1', ['att-1'], 'user-1', ['branch-1']),
    ).rejects.toThrow('outside your branch scope');
  });
});
