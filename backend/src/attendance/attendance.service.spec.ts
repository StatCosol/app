import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AttendanceService } from './attendance.service';
import { AttendanceEntity } from './entities/attendance.entity';
import { AttendanceAuditLogEntity } from './entities/attendance-audit-log.entity';
import { AttendanceMismatchEntity } from './entities/attendance-mismatch.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { BiometricService } from '../biometric/biometric.service';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let biometricService: {
    processRange: jest.Mock;
    syncFaceDeskRange: jest.Mock;
  };

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
      syncFaceDeskRange: jest.fn().mockResolvedValue({ inserted: 0 }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: getRepositoryToken(AttendanceEntity), useValue: mockRepo() },
        { provide: getRepositoryToken(EmployeeEntity), useValue: mockRepo() },
        {
          provide: getRepositoryToken(AttendanceMismatchEntity),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(AttendanceAuditLogEntity),
          useValue: mockRepo(),
        },
        {
          provide: DataSource,
          useValue: { query: jest.fn().mockResolvedValue([]) },
        },
        { provide: BiometricService, useValue: biometricService },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('shows FaceDesk punch times without GPS alongside mobile location details', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        employeeId: 'employee-1',
        punchType: 'IN',
        epoch: Date.parse('2026-10-11T00:20:00+05:30') / 1000,
        latitude: '17.4',
        longitude: '78.4',
        accuracy: '5',
        captureMethod: 'FACE',
      },
      {
        employeeId: 'employee-1',
        punchType: 'OUT',
        epoch: Date.parse('2026-10-11T01:20:00+05:30') / 1000,
        latitude: null,
        longitude: null,
        accuracy: null,
        captureMethod: 'FACE',
      },
    ]);
    (service as any).ds = { query };
    const rows = await (service as any).attachDayPunches(
      [{ employeeId: 'employee-1' }, { employeeId: 'employee-2' }],
      'client-1',
      '2026-10-11',
    );
    expect(rows[0].punches).toEqual([
      expect.objectContaining({
        punchType: 'IN',
        time: '00:20:00',
        mapUrl: 'https://www.google.com/maps?q=17.4,78.4',
      }),
      expect.objectContaining({
        punchType: 'OUT',
        time: '01:20:00',
        mapUrl: null,
        captureMethod: 'FACE',
      }),
    ]);
    expect(rows[1].punches).toEqual([]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('facedesk_attendance_logs'),
      ['client-1', '2026-10-11', ['employee-1', 'employee-2']],
    );
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

    expect(biometricService.syncFaceDeskRange).toHaveBeenCalledWith(
      'client-1',
      '2026-05-28',
      '2026-05-28',
    );
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

    expect(biometricService.syncFaceDeskRange).toHaveBeenCalledWith(
      'client-1',
      '2026-05-28',
      '2026-05-28',
    );
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

  describe('manual changes: audit trail and payroll lock', () => {
    const employee = {
      id: 'emp-1',
      clientId: 'client-1',
      branchId: 'branch-1',
      employeeCode: 'E001',
    };
    const record = () => ({
      id: 'att-1',
      clientId: 'client-1',
      branchId: 'branch-1',
      employeeId: 'emp-1',
      date: '2026-05-28',
      status: 'PRESENT',
      approvalStatus: 'APPROVED',
    });
    let audit: jest.Mock;
    let dsQuery: jest.Mock;

    beforeEach(() => {
      (service as any).empRepo.findOne = jest.fn().mockResolvedValue(employee);
      (service as any).repo.save = jest.fn(async (row: any) => ({
        id: 'att-new',
        ...row,
      }));
      (service as any).repo.create = jest.fn((row: any) => row);
      audit = jest.fn(async (row: any) => row);
      (service as any).auditRepo.save = audit;
      (service as any).auditRepo.create = jest.fn((row: any) => row);
      dsQuery = (service as any).ds.query;
    });

    it('audits a mark that overwrites an existing day as an EDIT', async () => {
      (service as any).repo.findOne = jest.fn().mockResolvedValue(record());
      await service.markAttendance(
        'client-1',
        { employeeId: 'emp-1', date: '2026-05-28', status: 'ABSENT' },
        null,
        'user-9',
      );
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EDIT',
          actorUserId: 'user-9',
          beforeSnapshot: expect.objectContaining({ status: 'PRESENT' }),
          afterSnapshot: expect.objectContaining({ status: 'ABSENT' }),
        }),
      );
    });

    it('audits a newly marked day as a CREATE', async () => {
      (service as any).repo.findOne = jest.fn().mockResolvedValue(null);
      await service.markAttendance(
        'client-1',
        { employeeId: 'emp-1', date: '2026-05-28', status: 'PRESENT' },
        null,
        'user-9',
      );
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', actorUserId: 'user-9' }),
      );
    });

    it('writes a DELETE audit row for every deleted day', async () => {
      (service as any).repo.find = jest.fn().mockResolvedValue([record()]);
      const saveAudit = jest.fn();
      const manager = {
        getRepository: jest.fn(() => ({
          find: jest.fn().mockResolvedValue([]),
          delete: jest.fn().mockResolvedValue({ affected: 1 }),
          create: (row: any) => row,
          save: saveAudit,
        })),
        query: jest.fn(),
      };
      (service as any).ds.transaction = (fn: any) => fn(manager);
      await service.deleteRecords('client-1', ['att-1'], null, 'user-9');
      expect(saveAudit).toHaveBeenCalledWith([
        expect.objectContaining({
          attendanceId: 'att-1',
          action: 'DELETE',
          actorUserId: 'user-9',
          beforeSnapshot: expect.objectContaining({ status: 'PRESENT' }),
        }),
      ]);
    });

    it.each([
      [
        'mark',
        (svc: AttendanceService) =>
          svc.markAttendance('client-1', {
            employeeId: 'emp-1',
            date: '2026-05-28',
            status: 'ABSENT',
          }),
      ],
      [
        'edit',
        (svc: AttendanceService) =>
          svc.editRecord('client-1', 'att-1', { status: 'ABSENT' }),
      ],
      [
        'approve',
        (svc: AttendanceService) =>
          svc.approveRecords('client-1', ['att-1'], 'user-9'),
      ],
      [
        'reject',
        (svc: AttendanceService) =>
          svc.rejectRecords('client-1', ['att-1'], 'user-9', 'wrong'),
      ],
      [
        'delete',
        (svc: AttendanceService) => svc.deleteRecords('client-1', ['att-1']),
      ],
    ])(
      "refuses to %s attendance once that month's payroll is submitted or approved",
      async (_label, act) => {
        (service as any).repo.findOne = jest.fn().mockResolvedValue(record());
        (service as any).repo.find = jest.fn().mockResolvedValue([record()]);
        dsQuery.mockResolvedValueOnce([{ '?column?': 1 }]);
        await expect(act(service)).rejects.toThrow(
          'Payroll for 2026-05 is already submitted or approved',
        );
        expect(dsQuery).toHaveBeenCalledWith(
          expect.stringContaining("status IN ('SUBMITTED', 'APPROVED')"),
          ['client-1', 2026, 5, 'branch-1'],
        );
        expect((service as any).repo.save).not.toHaveBeenCalled();
      },
    );
  });
});
