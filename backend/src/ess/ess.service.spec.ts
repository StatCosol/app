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
});
