import { PayrollProcessingService } from './payroll-processing.service';

/**
 * Derived components are recomputed; human-supplied ones are not.
 *
 * The value map that feeds the rule engine used to be seeded with every stored
 * value — CALCULATED ones included — and the rule loop skips any code already
 * in the map. So a derived component kept its first figure forever: change
 * Basic from 15000 to 20000 with an HRA rule of 40% and HRA stayed at 6000
 * instead of becoming 8000, while the payslip showed the new Basic beside the
 * stale HRA.
 */
describe('reprocessing a payroll run', () => {
  function makeService(
    existingValues: Array<{
      componentCode: string;
      amount: number;
      source: string;
    }>,
  ) {
    const upserts: Array<{ code: string; amount: number }> = [];

    const args: any[] = new Array(16).fill({});
    // runRepo
    args[0] = {
      findOne: async () => ({
        id: 'run-1',
        clientId: 'c1',
        status: 'DRAFT',
        periodMonth: 4,
        periodYear: 2026,
      }),
      save: async (r: any) => r,
      update: async () => undefined,
    };
    // runEmpRepo
    args[1] = {
      find: async () => [
        {
          id: 'emp-1',
          employeeCode: 'E001',
          employeeName: 'Example',
          stateCode: 'KA',
        },
      ],
      save: async (e: any) => e,
      update: async () => undefined,
    };
    // compValRepo
    args[3] = { find: async () => existingValues };
    // setupRepo
    args[4] = {
      findOne: async () => ({
        clientId: 'c1',
        ptEnabled: false,
        lwfEnabled: false,
      }),
    };
    // compRepo
    args[5] = {
      find: async () => [
        { id: 'c-basic', code: 'BASIC', componentType: 'EARNING' },
        { id: 'c-hra', code: 'HRA', componentType: 'EARNING' },
      ],
    };
    // ruleRepo — HRA is 40% of BASIC
    args[6] = {
      find: async ({ where }: any) =>
        where.componentId === 'c-hra'
          ? [
              {
                id: 'r-hra',
                ruleType: 'PERCENTAGE',
                baseComponent: 'BASIC',
                percentage: 40,
              },
            ]
          : [],
    };
    // slabRepo
    args[7] = { find: async () => [] };
    // empRepo
    args[8] = { findOne: async () => null, update: async () => undefined };
    // dataSource
    args[13] = { query: async () => [{ statecode: 'KA' }] };
    // statutory
    args[14] = { compute: (p: any) => ({ values: p.values }) };
    // stateStat
    args[15] = { applyStateDeductions: async (p: any) => p.values };

    const svc = new (PayrollProcessingService as any)(...args);
    jest
      .spyOn(svc as any, 'upsertValue')
      .mockImplementation(
        async (_runId: any, _empId: any, code: any, amount: any) => {
          upserts.push({ code, amount: Number(amount) });
        },
      );
    return { svc, upserts };
  }

  const latest = (
    upserts: Array<{ code: string; amount: number }>,
    code: string,
  ) => [...upserts].reverse().find((u) => u.code === code)?.amount;

  it('recalculates a derived component after its base changes', async () => {
    // Basic was re-uploaded as 20000; HRA 6000 is last pass's calculated value.
    const { svc, upserts } = makeService([
      { componentCode: 'BASIC', amount: 20000, source: 'UPLOADED' },
      { componentCode: 'HRA', amount: 6000, source: 'CALCULATED' },
    ]);

    await svc.processRun('run-1');

    expect(latest(upserts, 'HRA')).toBe(8000);
  });

  it('does not recompute over an uploaded value', async () => {
    const { svc, upserts } = makeService([
      { componentCode: 'BASIC', amount: 20000, source: 'UPLOADED' },
      { componentCode: 'HRA', amount: 6000, source: 'UPLOADED' },
    ]);

    await svc.processRun('run-1');

    // The sheet said 6000, so 6000 it stays — the rule does not overrule it.
    expect(latest(upserts, 'HRA')).not.toBe(8000);
  });

  it('does not recompute over a manual edit or an override', async () => {
    for (const source of ['MANUAL_EDIT', 'OVERRIDE']) {
      const { svc, upserts } = makeService([
        { componentCode: 'BASIC', amount: 20000, source: 'UPLOADED' },
        { componentCode: 'HRA', amount: 6000, source },
      ]);

      await svc.processRun('run-1');

      expect(latest(upserts, 'HRA')).not.toBe(8000);
    }
  });
});
