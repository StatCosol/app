import { PayrollEngineService } from './payroll-engine.service';
import { PayrollApprovalService } from '../payroll-approval.service';

function barrier() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

function fixture() {
  const held = new Set<string>();
  const ds = {
    createQueryRunner: () => {
      const owned = new Set<string>();
      return {
        connect: async () => undefined,
        query: async (sql: string, params: string[]) => {
          const key = params[0];
          if (sql.includes('pg_try_advisory_lock')) {
            if (held.has(key)) return [{ acquired: false }];
            held.add(key);
            owned.add(key);
            return [{ acquired: true }];
          }
          held.delete(key);
          owned.delete(key);
          return [{ released: true }];
        },
        release: async () => {
          for (const key of owned) held.delete(key);
        },
      };
    },
  };
  const state: any = {
    id: 'run',
    clientId: 'client',
    periodYear: 2025,
    periodMonth: 12,
    payrollCategory: 'REGULAR',
    status: 'PROCESSED',
  };
  const repo = {
    findOne: jest.fn(async () => ({ ...state })),
    save: jest.fn(async (value) => {
      Object.assign(state, value);
      return value;
    }),
    update: jest.fn(async (where, value) => {
      if (where.status !== state.status) return { affected: 0 };
      Object.assign(state, value);
      return { affected: 1 };
    }),
  };
  const engine: any = new (PayrollEngineService as any)();
  Object.assign(engine, {
    ds,
    runRepo: repo,
    setupRepo: { findOne: async () => ({ clientId: 'client' }) },
    compRepo: {
      find: async () => [{ code: 'BASIC', componentType: 'EARNING' }],
    },
    runEmpRepo: { find: async () => [{ employeeCode: 'E001' }] },
    attendanceService: { getMonthlySummary: async () => [] },
    processEmployee: jest.fn(async () => undefined),
  });
  const processing = {
    leaveValidation: jest.fn(async () => ({ rows: [] })),
    otValidation: jest.fn(async () => ({ rows: [] })),
  };
  const approval = new (PayrollApprovalService as any)(
    repo,
    processing,
    { assertClientAllowed: async () => undefined },
    ds,
  ) as PayrollApprovalService;
  return { engine, approval, processing, state, held };
}
const maker = { userId: 'maker', roleCode: 'PAYROLL' } as any;
const checker = { userId: 'checker', roleCode: 'CCO' } as any;

describe('Payroll calculation and approval share the same run lock', () => {
  it.each(['all', 'selected'])(
    'rejects submission while %s calculation owns the run, then allows retry',
    async (mode) => {
      const { engine, approval, state, held } = fixture();
      const started = barrier(),
        finish = barrier();
      engine.processEmployee.mockImplementation(async () => {
        started.release();
        await finish.wait;
      });
      const calculating =
        mode === 'all'
          ? engine.processWithEngine('run')
          : engine.processSpecificEmployees('run', ['E001']);
      await started.wait;
      try {
        await expect(
          approval.submitForApproval('run', 'maker', maker),
        ).rejects.toThrow('processing');
        expect(state.status).toBe('PROCESSED');
      } finally {
        finish.release();
        await calculating;
      }
      expect(held.size).toBe(0);
      await approval.submitForApproval('run', 'maker', maker);
      await approval.approveRun('run', 'checker', 'Verified', checker);
      expect(state.status).toBe('APPROVED');
    },
  );

  it.each(['all', 'selected'])(
    'rejects %s calculation while submission validates, and rechecks SUBMITTED on retry',
    async (mode) => {
      const { engine, approval, processing, state, held } = fixture();
      const started = barrier(),
        finish = barrier();
      processing.leaveValidation.mockImplementation(async () => {
        started.release();
        await finish.wait;
        return { rows: [] };
      });
      const submitting = approval.submitForApproval('run', 'maker', maker);
      await started.wait;
      const calculate = () =>
        mode === 'all'
          ? engine.processWithEngine('run')
          : engine.processSpecificEmployees('run', ['E001']);
      try {
        await expect(calculate()).rejects.toThrow('processing');
        expect(engine.processEmployee).not.toHaveBeenCalled();
      } finally {
        finish.release();
        await submitting;
      }
      expect(state.status).toBe('SUBMITTED');
      await expect(calculate()).rejects.toThrow('locked');
      expect(held.size).toBe(0);
    },
  );

  it('releases the run lock when validation throws, permitting corrected retry', async () => {
    const { approval, processing, state, held } = fixture();
    processing.leaveValidation.mockRejectedValueOnce(new Error('Unavailable'));
    await expect(
      approval.submitForApproval('run', 'maker', maker),
    ).rejects.toThrow('Unavailable');
    expect(held.size).toBe(0);
    await approval.submitForApproval('run', 'maker', maker);
    expect(state.status).toBe('SUBMITTED');
  });
});
