import { lastValueFrom, defer, of } from 'rxjs';
import { PayrollRunWriteLockInterceptor } from './payroll-run-write-lock.interceptor';
import { PayrollProcessingController } from './payroll-processing.controller';
import { assertPayrollRunEditable } from './payroll-run-state';
import { withPayrollRunLock } from './engine/payroll-period-lock';

describe('Run input state contract', () => {
  it('invalidates processed totals before a leave-input write, including failed writes', async () => {
    const run = { id: 'run', clientId: 'client', status: 'PROCESSED' };
    const repo = {
      findOne: async () => run,
      update: jest.fn(async () => ({ affected: 1 })),
    };
    const controller: any = Object.create(
      PayrollProcessingController.prototype,
    );
    const write = jest.fn(async () => {
      expect(run.status).toBe('DRAFT');
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'run', status: 'PROCESSED' },
        { status: 'DRAFT' },
      );
      throw new Error('Input unavailable');
    });
    Object.assign(controller, {
      ds: { getRepository: () => repo },
      access: { assertClientAllowed: async () => undefined },
      processingSvc: { resolveLeaveValidation: write },
    });
    await expect(
      controller.resolveLeaveValidation(
        'run',
        'E001',
        { source: 'ESS' },
        { userId: 'maker' },
      ),
    ).rejects.toThrow('Input unavailable');
    expect(run.status).toBe('DRAFT');
  });
  it.each(['DRAFT', 'PROCESSED', 'REJECTED', 'IN_PROGRESS'])(
    'preserves %s input processing',
    (status) => {
      expect(() => assertPayrollRunEditable({ status })).not.toThrow();
    },
  );
  it.each(['SUBMITTED', 'APPROVED', 'LOCKED', 'FINALIZED', 'UNKNOWN', ''])(
    'rejects changes in %s',
    (status) => {
      expect(() => assertPayrollRunEditable({ status })).toThrow('locked');
    },
  );

  it.each(['process', 'reprocess', 'add', 'edit', 'leave', 'ot', 'patch'])(
    'rejects %s before touching submitted run inputs',
    async (action) => {
      const repo = {
        findOne: jest.fn(async () => ({
          id: 'run',
          clientId: 'client',
          status: 'SUBMITTED',
        })),
        save: jest.fn(),
      };
      const write = jest.fn();
      const controller: any = Object.create(
        PayrollProcessingController.prototype,
      );
      Object.assign(controller, {
        ds: { getRepository: () => repo, query: write },
        access: { assertClientAllowed: jest.fn() },
        engineSvc: {
          processWithEngine: write,
          processSpecificEmployees: write,
        },
        processingSvc: {
          resolveLeaveValidation: write,
          resolveOtValidation: write,
        },
      });
      const user = { userId: 'maker', roleCode: 'PAYROLL' };
      const call = {
        process: () => controller.processRun('run', user),
        reprocess: () =>
          controller.reprocessEmployees('run', user, {
            employeeCodes: ['E001'],
          }),
        add: () =>
          controller.addEmployeesToRun(
            'run',
            { employeeCodes: ['E001'] },
            user,
          ),
        edit: () =>
          controller.editEmployeeInputs(
            'run',
            'E001',
            { payableDays: 20 },
            user,
          ),
        leave: () =>
          controller.resolveLeaveValidation(
            'run',
            'E001',
            { source: 'ESS' },
            user,
          ),
        ot: () =>
          controller.resolveOtValidation(
            'run',
            'E001',
            { source: 'ESS' },
            user,
          ),
        patch: () =>
          controller.patchAttendance('run', user, {
            totalPayable: 26,
            data: [],
          }),
      }[action]!;
      await expect(call()).rejects.toThrow('locked');
      expect(write).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    },
  );
});

describe('Run write interceptor', () => {
  it('uses one lock for equivalent UUID spellings and nested recalculation', async () => {
    const query = jest.fn(async (_sql: string, _params: string[]) => [
      { acquired: true },
    ]);
    const ds = {
      createQueryRunner: jest.fn(() => ({
        connect: async () => undefined,
        query,
        release: async () => undefined,
      })),
    } as any;
    const id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    await withPayrollRunLock(ds, id.toUpperCase(), () =>
      withPayrollRunLock(ds, '{' + id + '}', async () => 'same run'),
    );
    expect(ds.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
      ['payroll-run:' + id.replace(/-/g, '')],
    );
  });
  const context = (method = 'POST', runId?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, params: { runId } }),
      }),
    }) as any;
  it('holds one connection across input writes and nested engine calculation', async () => {
    const query = jest.fn(async (_sql: string, _params: string[]) => [
      { acquired: true },
    ]);
    const release = jest.fn(async () => undefined);
    const ds = {
      createQueryRunner: jest.fn(() => ({
        connect: async () => undefined,
        query,
        release,
      })),
    } as any;
    const interceptor = new PayrollRunWriteLockInterceptor(ds);
    const write = jest.fn(async () => 'calculated');
    const response = interceptor.intercept(context('POST', 'run'), {
      handle: () => defer(() => withPayrollRunLock(ds, 'run', write)),
    });
    expect(await lastValueFrom(response)).toBe('calculated');
    expect(write).toHaveBeenCalledTimes(1);
    expect(ds.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.map((call) => call[0])).toEqual([
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
      'SELECT pg_advisory_unlock(hashtextextended($1, 0))',
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('releases its lock when an input operation fails', async () => {
    const release = jest.fn(async () => undefined);
    const query = jest.fn(async (_sql: string, _params: string[]) => [
      { acquired: true },
    ]);
    const ds = {
      createQueryRunner: () => ({
        connect: async () => undefined,
        query,
        release,
      }),
    } as any;
    const response = new PayrollRunWriteLockInterceptor(ds).intercept(
      context('POST', 'run'),
      {
        handle: () =>
          defer(async () => {
            throw new Error('Invalid input');
          }),
      },
    );
    await expect(lastValueFrom(response)).rejects.toThrow('Invalid input');
    expect(query).toHaveBeenLastCalledWith(
      'SELECT pg_advisory_unlock(hashtextextended($1, 0))',
      ['payroll-run:run'],
    );
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('reacquires a lock for delayed work inheriting a completed operation context', async () => {
    const query = jest.fn(async (_sql: string, _params: string[]) => [
      { acquired: true },
    ]);
    const ds = {
      createQueryRunner: jest.fn(() => ({
        connect: async () => undefined,
        query,
        release: async () => undefined,
      })),
    } as any;
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let delayed!: Promise<string>;
    await withPayrollRunLock(ds, 'run', async () => {
      delayed = (async () => {
        await gate;
        return withPayrollRunLock(ds, 'run', async () => 'new operation');
      })();
    });
    resume();
    expect(await delayed).toBe('new operation');
    expect(ds.createQueryRunner).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['GET', 'run'],
    ['POST', undefined],
  ])('does not lock %s requests without a run write', async (method, id) => {
    const ds = { createQueryRunner: jest.fn() } as any;
    expect(
      await lastValueFrom(
        new PayrollRunWriteLockInterceptor(ds).intercept(context(method, id), {
          handle: () => of('read'),
        }),
      ),
    ).toBe('read');
    expect(ds.createQueryRunner).not.toHaveBeenCalled();
  });
});
