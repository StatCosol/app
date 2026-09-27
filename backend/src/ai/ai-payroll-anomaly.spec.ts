import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AiPayrollAnomalyService } from './ai-payroll-anomaly.service';
import { AiController } from './ai.controller';

describe('AI payroll anomaly scan integrity', () => {
  let repo: any;
  let db: any;
  let service: AiPayrollAnomalyService;
  let checks: any[][];
  let client: any[];
  let run: any[];
  let manager: any;
  let transactionalRepo: any;
  beforeEach(() => {
    client = [{ id: 'company' }];
    run = [{ id: 'canonical-run' }];
    checks = [[], [], [], []];
    let index = 0;
    db = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM clients')) return client;
        if (sql.includes('FROM payroll_runs')) return run;
        return checks[index++];
      }),
    };
    repo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    transactionalRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    manager = {
      query: jest.fn(async (sql: string) =>
        sql.includes('FROM clients') ? client : run,
      ),
      getRepository: jest.fn(() => transactionalRepo),
    };
    db.transaction = jest.fn(async (_isolation, callback) => callback(manager));
    service = new AiPayrollAnomalyService(repo, db, {} as any);
  });

  it('rejects missing/deleted companies before scanning or saving', async () => {
    client = [];
    await expect(service.detectAnomalies('company', 'run')).rejects.toThrow(
      NotFoundException,
    );
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('is_deleted = false'),
      ['company'],
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects missing or foreign-company runs before scanning or saving', async () => {
    run = [];
    await expect(service.detectAnomalies('company', 'foreign')).rejects.toThrow(
      'Payroll run does not belong to the selected company',
    );
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('id = $1 AND client_id = $2'),
      ['foreign', 'company'],
    );
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it.each([undefined, 'UPPERCASE-RUN'])(
    'binds the optional canonical run on all four checks (%s)',
    async (input) => {
      const rows = await service.detectAnomalies('company', input);
      const scans = db.query.mock.calls.filter(([sql]: [string]) =>
        sql.includes('FROM employees'),
      );
      expect(scans).toHaveLength(4);
      for (const [sql, params] of scans) {
        expect(sql).toContain('pre.client_id = e.client_id');
        expect(sql).toContain('pre.employee_id = e.id');
        expect(sql).toContain(
          'pre.employee_id IS NULL AND pre.employee_code = e.employee_code',
        );
        expect(params).toEqual(['company', input ? 'canonical-run' : null]);
      }
      expect(rows).toEqual([]);
      expect(repo.save).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 'run'])(
    'preserves the run reference on every finding type (%s)',
    async (input) => {
      const employee = {
        employee_id: 'employee',
        branch_id: 'branch',
        name: 'Test',
        basic_salary: 5000,
        gross_salary: 30000,
        employee_pf_contribution: 6000,
        employer_pf_contribution: 5000,
      };
      checks = [[employee], [employee], [employee], [employee]];
      const result = await service.detectAnomalies('company', input);
      expect(result).toHaveLength(4);
      expect(new Set(result.map((row) => row.anomalyType)).size).toBe(4);
      for (const row of result)
        expect(row.payrollRunId).toBe(input ? 'canonical-run' : null);
      expect(transactionalRepo.save).toHaveBeenCalledTimes(1);
      expect(repo.save).not.toHaveBeenCalled();
    },
  );

  it.each([0, 1, 2, 3])(
    'does not save partial findings if check %s fails',
    async (failed) => {
      let index = 0;
      db.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM clients')) return client;
        if (index++ === failed) throw new Error('private SQL details');
        return [
          { employee_id: 'employee', basic_salary: 5000, gross_salary: 30000 },
        ];
      });
      await expect(service.detectAnomalies('company')).rejects.toThrow(
        'private SQL details',
      );
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    },
  );

  it('propagates a persistence failure instead of returning detected findings', async () => {
    checks[0] = [{ employee_id: 'employee' }];
    transactionalRepo.save.mockRejectedValue(new Error('save failed'));
    await expect(service.detectAnomalies('company')).rejects.toThrow(
      'save failed',
    );
  });

  it.each([true, false])(
    'rejects a company deleted during scanning, even with no findings (%s)',
    async (hasFindings) => {
      if (hasFindings) checks[0] = [{ employee_id: 'employee' }];
      manager.query.mockResolvedValue([]);
      await expect(service.detectAnomalies('company')).rejects.toThrow(
        NotFoundException,
      );
      expect(manager.query).toHaveBeenCalledWith(
        'SELECT id FROM clients WHERE id = $1 AND is_deleted = false FOR SHARE',
        ['company'],
      );
      expect(transactionalRepo.save).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    },
  );

  it('rejects a run removed or reassigned during scanning before saving', async () => {
    checks[0] = [{ employee_id: 'employee' }];
    manager.query.mockResolvedValueOnce(client).mockResolvedValueOnce([]);
    await expect(service.detectAnomalies('company', 'run')).rejects.toThrow(
      BadRequestException,
    );
    expect(manager.query).toHaveBeenLastCalledWith(
      'SELECT id FROM payroll_runs WHERE id = $1 AND client_id = $2 FOR SHARE',
      ['canonical-run', 'company'],
    );
    expect(transactionalRepo.save).not.toHaveBeenCalled();
  });

  it('uses the locked transaction repository and explicit READ COMMITTED isolation', async () => {
    checks[0] = [{ employee_id: 'employee' }];
    await service.detectAnomalies('company', 'run');
    expect(db.transaction).toHaveBeenCalledWith(
      'READ COMMITTED',
      expect.any(Function),
    );
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(manager.query.mock.invocationCallOrder[1]).toBeLessThan(
      transactionalRepo.save.mock.invocationCallOrder[0],
    );
    expect(transactionalRepo.save).toHaveBeenCalledTimes(1);
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('propagates a transaction failure instead of reporting a successful scan', async () => {
    db.transaction.mockRejectedValue(new Error('transaction failed'));
    await expect(service.detectAnomalies('company')).rejects.toThrow(
      'transaction failed',
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe('AI payroll detection HTTP errors', () => {
  function controller(error: Error) {
    return new AiController(
      {} as any,
      {} as any,
      { detectAnomalies: jest.fn().mockRejectedValue(error) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { assertClientAllowed: jest.fn() } as any,
    );
  }
  it.each([
    new BadRequestException('Invalid run'),
    new NotFoundException('Company not found'),
  ])('preserves validation status and message: %s', async (error) => {
    await expect(
      controller(error).detectPayrollAnomalies({ clientId: 'company' }, {
        roleCode: 'ADMIN',
      } as any),
    ).rejects.toBe(error);
  });
  it('does not expose internal SQL details or return success on a failed scan', async () => {
    await expect(
      controller(new Error('private SQL details')).detectPayrollAnomalies(
        { clientId: 'company' },
        { roleCode: 'ADMIN' } as any,
      ),
    ).rejects.toMatchObject({
      status: 500,
      message:
        'Anomaly detection could not be completed. Please retry or contact support.',
    });
  });
});
