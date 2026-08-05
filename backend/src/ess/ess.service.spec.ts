import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EssService } from './ess.service';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { EmployeeStatutoryEntity } from '../employees/entities/employee-statutory.entity';
import { EmployeeNominationEntity } from '../employees/entities/employee-nomination.entity';
import { EmployeeNominationMemberEntity } from '../employees/entities/employee-nomination-member.entity';
import { LeaveApplicationEntity } from './entities/leave-application.entity';
import { LeaveBalanceEntity } from './entities/leave-balance.entity';
import { LeaveLedgerEntity } from './entities/leave-ledger.entity';
import { LeavePolicyEntity } from './entities/leave-policy.entity';
import { PayrollPayslipArchiveEntity } from '../payroll/entities/payroll-payslip-archive.entity';
import { PayrollRunEntity } from '../payroll/entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../payroll/entities/payroll-run-employee.entity';
import { PayrollRunComponentValueEntity } from '../payroll/entities/payroll-run-component-value.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { AttendanceService } from '../attendance/attendance.service';
import { EssDiscrepancyNoteEntity } from './entities/ess-discrepancy-note.entity';

describe('EssService', () => {
  let service: EssService;

  const mockRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EssService,
        {
          provide: getRepositoryToken(EmployeeEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(EmployeeStatutoryEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(EmployeeNominationEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(EmployeeNominationMemberEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(LeaveApplicationEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(LeaveBalanceEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(LeaveLedgerEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(LeavePolicyEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(PayrollPayslipArchiveEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(PayrollRunEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(PayrollRunEmployeeEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(PayrollRunComponentValueEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(ClientEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(EssDiscrepancyNoteEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: AttendanceService,
          useValue: { getAttendanceSummary: jest.fn() },
        },
        { provide: DataSource, useValue: { query: jest.fn() } },
      ],
    }).compile();

    service = module.get<EssService>(EssService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('uses India business date/time for today attendance', () => {
    const businessNow = (service as any).businessNow(
      new Date('2026-05-28T22:45:12.000Z'),
    );

    expect(businessNow).toEqual({
      date: '2026-05-29',
      time: '04:15:12',
    });
  });

  describe('multi-punch summariseDay', () => {
    const base = Date.parse('2026-08-06T03:30:00.000Z') / 1000; // 09:00 IST

    const punch = (type: 'IN' | 'OUT', offsetHrs: number, lat = 12.9, lng = 77.5) => ({
      punchType: type,
      epoch: base + offsetHrs * 3600,
      latitude: lat,
      longitude: lng,
    });

    it('sums worked hours across every in→out pair (multiple site visits)', async () => {
      // IN 09:00 → OUT 12:00 (3h), IN 14:00 → OUT 18:00 (4h) = 7h total
      (service as any).ds.query.mockResolvedValueOnce([
        punch('IN', 0),
        punch('OUT', 3),
        punch('IN', 5),
        punch('OUT', 9),
      ]);

      const summary = await (service as any).summariseDay('emp-1', '2026-08-06');

      expect(summary.workedDecimal).toBeCloseTo(7, 5);
      expect(summary.openSession).toBe(false);
      expect(summary.punchCount).toBe(4);
      expect(summary.firstInTime).toBe('09:00:00');
      expect(summary.lastOutTime).toBe('18:00:00');
    });

    it('flags an open session when the last punch is an unpaired check-in', async () => {
      // IN 09:00 → OUT 12:00 (3h), IN 14:00 (still on site)
      (service as any).ds.query.mockResolvedValueOnce([
        punch('IN', 0),
        punch('OUT', 3),
        punch('IN', 5),
      ]);

      const summary = await (service as any).summariseDay('emp-1', '2026-08-06');

      expect(summary.workedDecimal).toBeCloseTo(3, 5);
      expect(summary.openSession).toBe(true);
      expect(summary.punchCount).toBe(3);
    });

    it('reports zero worked time and no open session for an empty day', async () => {
      (service as any).ds.query.mockResolvedValueOnce([]);

      const summary = await (service as any).summariseDay('emp-1', '2026-08-06');

      expect(summary.workedDecimal).toBe(0);
      expect(summary.openSession).toBe(false);
      expect(summary.firstInTime).toBeNull();
      expect(summary.lastOutTime).toBeNull();
    });
  });
});
