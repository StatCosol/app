import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PayrollEngineService } from './payroll-engine.service';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';
import { PayrollRunItemEntity } from '../entities/payroll-run-item.entity';
import { PayrollRunComponentValueEntity } from '../entities/payroll-run-component-value.entity';
import { PayrollComponentEntity } from '../entities/payroll-component.entity';
import { PayrollClientSetupEntity } from '../entities/payroll-client-setup.entity';
import { PayCalcTraceEntity } from '../entities/pay-calc-trace.entity';
import { EmployeeEntity } from '../../employees/entities/employee.entity';
import { AttendanceService } from '../../attendance/attendance.service';
import { LeaveLedgerEntity } from '../../ess/entities/leave-ledger.entity';
import { LeaveBalanceEntity } from '../../ess/entities/leave-balance.entity';
import { LeavePolicyEntity } from '../../ess/entities/leave-policy.entity';
import { StructureResolverService } from './structure-resolver.service';
import { RulesetResolverService } from './ruleset-resolver.service';
import { StatutoryCalculatorService } from '../services/statutory-calculator.service';
import { StateStatutoryService } from '../services/state-statutory.service';
import { RoundingService } from './rounding.service';
import { WageBaseService } from './wage-base.service';
import { TdsCalculatorService } from '../services/tds-calculator.service';
import { PayrollApprovalService } from '../payroll-approval.service';
import { payslipDownloadVisible } from '../client-payroll-document-access';

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
});

describe('PayrollEngineService', () => {
  let service: PayrollEngineService;
  let moduleRef: Awaited<
    ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>
  >;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        PayrollEngineService,
        { provide: getRepositoryToken(PayrollRunEntity), useFactory: mockRepo },
        {
          provide: getRepositoryToken(PayrollRunEmployeeEntity),
          useFactory: mockRepo,
        },
        {
          provide: getRepositoryToken(PayrollRunItemEntity),
          useFactory: mockRepo,
        },
        {
          provide: getRepositoryToken(PayrollRunComponentValueEntity),
          useFactory: mockRepo,
        },
        {
          provide: getRepositoryToken(PayrollComponentEntity),
          useFactory: mockRepo,
        },
        {
          provide: getRepositoryToken(PayrollClientSetupEntity),
          useFactory: mockRepo,
        },
        {
          provide: getRepositoryToken(PayCalcTraceEntity),
          useFactory: mockRepo,
        },
        { provide: getRepositoryToken(EmployeeEntity), useFactory: mockRepo },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: () => ({
              connect: async () => undefined,
              query: async () => [{ acquired: true }],
              release: async () => undefined,
            }),
          },
        },
        { provide: StructureResolverService, useValue: { resolve: jest.fn() } },
        {
          provide: RulesetResolverService,
          useValue: { resolveAndLoad: jest.fn(), loadParameters: jest.fn() },
        },
        {
          provide: StatutoryCalculatorService,
          useValue: { compute: jest.fn().mockReturnValue({ values: {} }) },
        },
        {
          provide: StateStatutoryService,
          useValue: { applyStateDeductions: jest.fn().mockResolvedValue({}) },
        },
        { provide: RoundingService, useValue: { round: jest.fn() } },
        {
          provide: WageBaseService,
          useValue: {
            computeWageBases: jest
              .fn()
              .mockReturnValue({ pfWage: 0, esiWage: 0, gross: 0 }),
          },
        },
        {
          provide: TdsCalculatorService,
          useValue: { calculate: jest.fn().mockReturnValue({ tds: 0 }) },
        },
        {
          provide: AttendanceService,
          useValue: {
            getAttendanceSummary: jest.fn(),
            getMonthlySummary: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(LeaveLedgerEntity),
          useFactory: mockRepo,
        },
        {
          provide: getRepositoryToken(LeaveBalanceEntity),
          useFactory: mockRepo,
        },
        {
          provide: getRepositoryToken(LeavePolicyEntity),
          useFactory: mockRepo,
        },
      ],
    }).compile();

    service = moduleRef.get(PayrollEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /**
   * A run is only PROCESSED if every employee actually calculated.
   *
   * The per-employee catch collects failures and carries on, which is right —
   * one broken formula should not abandon the other 200 employees. But the
   * status was then set to PROCESSED regardless, and submitRun() admits exactly
   * that status, so a run where every employee failed could be submitted and
   * approved on totals that were never computed.
   */
  describe('run status after processing', () => {
    const arrange = () => {
      const run: any = {
        id: 'run-1',
        clientId: 'c1',
        periodMonth: 4,
        periodYear: 2026,
        status: 'DRAFT',
      };
      moduleRef.get(getRepositoryToken(PayrollRunEntity)).findOne = jest
        .fn()
        .mockResolvedValue(run);
      moduleRef.get(getRepositoryToken(PayrollRunEntity)).save = jest
        .fn()
        .mockImplementation(async (r: any) => r);
      moduleRef.get(getRepositoryToken(PayrollClientSetupEntity)).findOne = jest
        .fn()
        .mockResolvedValue({ clientId: 'c1' });
      moduleRef.get(getRepositoryToken(PayrollComponentEntity)).find = jest
        .fn()
        .mockResolvedValue([
          { id: 'comp-1', code: 'BASIC', componentType: 'EARNING' },
        ]);
      moduleRef.get(getRepositoryToken(PayrollRunEmployeeEntity)).find = jest
        .fn()
        .mockResolvedValue([
          { id: 'emp-1', employeeCode: 'E001', employeeName: 'Example' },
        ]);
      return run;
    };

    it('leaves a run that failed out of PROCESSED, so it cannot be submitted', async () => {
      const run = arrange();
      jest
        .spyOn(service as any, 'processEmployee')
        .mockRejectedValue(new Error('Undefined variable BASIC'));

      const result = await service.processWithEngine('run-1');

      expect(result.errors).toHaveLength(1);
      expect(result.processed).toBe(0);
      // submitRun() admits only PROCESSED, so DRAFT is what blocks it.
      expect(result.status).toBe('DRAFT');
      expect(run.status).toBe('DRAFT');
    });

    it('demotes a previously PROCESSED run when a reprocess fails', async () => {
      // Its stored values have been partly overwritten by this pass, so
      // leaving it submittable would approve a half-recomputed run.
      const run = arrange();
      run.status = 'PROCESSED';
      jest
        .spyOn(service as any, 'processEmployee')
        .mockRejectedValue(new Error('boom'));

      const result = await service.processWithEngine('run-1');

      expect(result.status).toBe('DRAFT');
      expect(run.status).toBe('DRAFT');
    });

    it.each(['all', 'selected'])(
      'stops before writing %s payroll when attendance loading fails',
      async (mode) => {
        arrange();
        (
          moduleRef.get(AttendanceService).getMonthlySummary as jest.Mock
        ).mockRejectedValue(new Error('connection lost'));
        const employee = jest
          .spyOn(service as any, 'processEmployee')
          .mockResolvedValue(undefined);
        await expect(
          mode === 'all'
            ? service.processWithEngine('run-1')
            : service.processSpecificEmployees('run-1', ['E001']),
        ).rejects.toThrow('Attendance summary could not be loaded');
        expect(employee).not.toHaveBeenCalled();
        expect(
          moduleRef.get(getRepositoryToken(PayrollRunEntity)).save,
        ).not.toHaveBeenCalled();
      },
    );

    it('does not mark an empty payroll run as processed', async () => {
      arrange();
      moduleRef
        .get(getRepositoryToken(PayrollRunEmployeeEntity))
        .find.mockResolvedValue([]);
      await expect(service.processWithEngine('run-1')).rejects.toThrow(
        'no employees',
      );
      expect(
        moduleRef.get(getRepositoryToken(PayrollRunEntity)).save,
      ).not.toHaveBeenCalled();
    });
    it('marks a clean run PROCESSED', async () => {
      const run = arrange();
      jest
        .spyOn(service as any, 'processEmployee')
        .mockResolvedValue(undefined as never);

      const result = await service.processWithEngine('run-1');

      expect(result.errors).toEqual([]);
      expect(result.processed).toBe(1);
      expect(result.status).toBe('PROCESSED');
      expect(run.status).toBe('PROCESSED');
    });

    it.each([
      ['SUBMITTED', 'all'],
      ['SUBMITTED', 'selected'],
      ['APPROVED', 'all'],
      ['APPROVED', 'selected'],
    ])(
      'blocks %s runs at the %s calculation entry point',
      async (status, mode) => {
        const run = arrange();
        run.status = status;
        const employee = jest
          .spyOn(service as any, 'processEmployee')
          .mockResolvedValue(undefined);
        await expect(
          mode === 'all'
            ? service.processWithEngine('run-1')
            : service.processSpecificEmployees('run-1', ['E001']),
        ).rejects.toThrow('locked');
        expect(employee).not.toHaveBeenCalled();
        expect(run.status).toBe(status);
        expect(
          moduleRef.get(getRepositoryToken(PayrollRunEntity)).save,
        ).not.toHaveBeenCalled();
      },
    );

    it('demotes failed selected-employee recalculation so partial totals cannot be submitted', async () => {
      const run = arrange();
      run.status = 'PROCESSED';
      jest
        .spyOn(service as any, 'processEmployee')
        .mockRejectedValue(new Error('Invalid formula'));
      const result = await service.processSpecificEmployees('run-1', ['E001']);
      expect(result.errors).toHaveLength(1);
      expect(result.status).toBe('DRAFT');
      expect(run.status).toBe('DRAFT');
      expect(
        moduleRef.get(getRepositoryToken(PayrollRunEntity)).save,
      ).toHaveBeenCalled();
    });

    it('does not promote a draft when only selected employees were calculated', async () => {
      const run = arrange();
      jest
        .spyOn(service as any, 'processEmployee')
        .mockResolvedValue(undefined);
      const result = await service.processSpecificEmployees('run-1', ['E001']);
      expect(result.status).toBe('DRAFT');
      expect(run.status).toBe('DRAFT');
    });

    it('requires a clean recalculation and separate CCO approval after rejection and correction', async () => {
      const run = arrange();
      const repo = moduleRef.get(getRepositoryToken(PayrollRunEntity));
      repo.update = jest.fn(async (where, changes) => {
        if (where.id !== run.id || where.status !== run.status)
          return { affected: 0 };
        Object.assign(run, changes);
        return { affected: 1 };
      });
      const approval = new PayrollApprovalService(
        repo,
        {
          leaveValidation: async () => ({ rows: [] }),
          otValidation: async () => ({ rows: [] }),
        } as any,
        { assertClientAllowed: async () => undefined } as any,
        moduleRef.get(DataSource),
      );
      const maker = { userId: 'maker', roleCode: 'PAYROLL' } as any;
      const checker = { userId: 'checker', roleCode: 'CCO' } as any;
      const process = jest
        .spyOn(service as any, 'processEmployee')
        .mockResolvedValue(undefined);
      await service.processWithEngine(run.id);
      await approval.submitForApproval(run.id, 'maker', maker);
      expect(payslipDownloadVisible(run.status, true)).toBe(false);
      await approval.rejectRun(
        run.id,
        'checker',
        'Correct attendance',
        checker,
      );
      await approval.revertToDraft(run.id, maker);
      process.mockRejectedValueOnce(new Error('Correction is incomplete'));
      await service.processWithEngine(run.id);
      await expect(
        approval.submitForApproval(run.id, 'maker', maker),
      ).rejects.toThrow('Only PROCESSED');
      await service.processWithEngine(run.id);
      await approval.submitForApproval(run.id, 'maker', maker);
      await expect(
        approval.approveRun(run.id, 'maker', '', checker),
      ).rejects.toThrow('different user');
      await approval.approveRun(
        run.id,
        'checker',
        'Reviewed corrected totals',
        checker,
      );
      expect(run.status).toBe('APPROVED');
      expect(payslipDownloadVisible(run.status, false)).toBe(false);
      expect(payslipDownloadVisible(run.status, true)).toBe(true);
      expect(run.rejectionReason).toBeNull();
    });
  });
});
