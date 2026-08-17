import { ClientPayrollCalculationService } from './client-payroll-calculation.service';
import { StateSlabService } from './services/state-slab.service';
import { BadRequestException } from '@nestjs/common';
import { PayrollClientStructureEntity } from './entities/payroll-client-structure.entity';

/**
 * Integration-style tests for ClientPayrollCalculationService.calculate().
 *
 * Unlike the pure-unit specs, this exercises the whole per-employee pipeline
 * together — real formula engine + component evaluation (FIXED/PERCENTAGE/
 * FORMULA) + PF/ESI/PT/LWF statutory logic + round-up + totals — with only the
 * slab resolver mocked. It's the closest stable proxy for a real payroll run.
 */

type Any = Record<string, unknown>;

const stat = (over: Any = {}) => ({
  stateCode: 'MH',
  minimumWage: 15000,
  warnIfGrossBelowMinWage: true,
  enablePt: false,
  enablePf: false,
  enableEsi: false,
  pfApplyIfGrossAbove: 0,
  pfWageCap: 15000,
  pfEmployeeRate: 12,
  esiEmployeeRate: 0.75,
  esiEmployerRate: 3.25,
  esiGrossCeiling: 21000,
  ...over,
});

const comp = (over: Any = {}) => ({
  code: 'X',
  componentType: 'EARNING',
  calculationMethod: 'FIXED',
  fixedValue: 0,
  basedOn: null,
  percentageValue: 0,
  formula: null,
  roundRule: 'ROUND',
  isActive: true,
  displayOrder: 1,
  ...over,
});

const structure = (over: Any = {}) =>
  ({
    clientId: 'client-1',
    statutoryConfigs: [stat()],
    components: [],
    ...over,
  }) as unknown as PayrollClientStructureEntity;

const input = (over: Any = {}) => ({
  gross: 30000,
  lopDays: 0,
  stateCode: 'MH',
  month: 5,
  year: 2026,
  ...over,
});

function makeService(slabMap: Record<string, number> = {}) {
  const slab = {
    resolveAmount: jest.fn(
      async ({ componentCode }: { componentCode: string }) =>
        slabMap[componentCode] ?? 0,
    ),
  } as unknown as StateSlabService;
  return new ClientPayrollCalculationService(slab);
}

// A realistic 3-component structure: BASIC=50% gross, HRA=20% basic, SPECIAL=balance
const standardComponents = [
  comp({
    code: 'BASIC',
    calculationMethod: 'PERCENTAGE',
    basedOn: 'GROSS',
    percentageValue: 50,
    displayOrder: 1,
  }),
  comp({
    code: 'HRA',
    calculationMethod: 'PERCENTAGE',
    basedOn: 'BASIC',
    percentageValue: 20,
    displayOrder: 2,
  }),
  comp({
    code: 'SPECIAL',
    calculationMethod: 'FORMULA',
    formula: 'GROSS - BASIC - HRA',
    displayOrder: 3,
  }),
];

describe('ClientPayrollCalculationService.calculate (integration)', () => {
  it('computes a full salary breakdown end-to-end', async () => {
    const svc = makeService({ PT: 200 });
    const res = await svc.calculate(
      structure({
        components: standardComponents,
        statutoryConfigs: [stat({ enablePt: true, enablePf: true })],
      }),
      input({ gross: 30000 }),
    );

    expect(res.values.BASIC).toBe(15000); // 50% of 30,000
    expect(res.values.HRA).toBe(3000); // 20% of BASIC
    expect(res.values.SPECIAL).toBe(12000); // balance via formula engine
    expect(res.values.PT).toBe(200); // from slab
    expect(res.values.PF_EMPLOYEE).toBe(1800); // 12% of capped 15,000
    expect(res.values.PF_EMPLOYER).toBe(1800);

    expect(res.totalEarnings).toBe(30000);
    expect(res.totalDeductions).toBe(2000); // PT 200 + PF 1800
    expect(res.employerContributions).toBe(1800);
    expect(res.netPay).toBe(28000);
    expect(res.warnings).toEqual([]);
  });

  it('rejects a negative gross', async () => {
    const svc = makeService();
    await expect(
      svc.calculate(structure(), input({ gross: -1 })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an unknown state (no statutory config)', async () => {
    const svc = makeService();
    await expect(
      svc.calculate(structure(), input({ stateCode: 'ZZ' })),
    ).rejects.toThrow(/No statutory config/);
  });

  it('warns when gross is below the applicable minimum wage', async () => {
    const svc = makeService();
    const res = await svc.calculate(
      structure({ components: standardComponents }),
      input({ gross: 10000 }),
    );
    expect(res.warnings.some((w) => /Minimum Wage/.test(w))).toBe(true);
  });

  it('applies ESI within the ceiling and drops it above', async () => {
    const cfg = { enableEsi: true, esiGrossCeiling: 21000 };
    const within = await makeService().calculate(
      structure({
        components: standardComponents,
        statutoryConfigs: [stat(cfg)],
      }),
      input({ gross: 20000 }),
    );
    expect(within.values.ESI_EMPLOYEE).toBe(150); // ceil(0.75% of 20,000)
    expect(within.values.ESI_EMPLOYER).toBe(650); // ceil(3.25% of 20,000)

    const above = await makeService().calculate(
      structure({
        components: standardComponents,
        statutoryConfigs: [stat(cfg)],
      }),
      input({ gross: 25000 }),
    );
    expect(above.values.ESI_EMPLOYEE).toBe(0);
  });

  it('skips PF when gross is at or below the apply-above threshold', async () => {
    const svc = makeService();
    const res = await svc.calculate(
      structure({
        components: standardComponents,
        statutoryConfigs: [
          stat({ enablePf: true, pfApplyIfGrossAbove: 25000 }),
        ],
      }),
      input({ gross: 20000 }),
    );
    expect(res.values.PF_EMPLOYEE).toBe(0);
  });

  it('adds ceil-rounded LWF from the slab resolver', async () => {
    const svc = makeService({ LWF_EMP: 20.5, LWF_ER: 40 });
    const res = await svc.calculate(
      structure({ components: standardComponents }),
      input(),
    );
    expect(res.values.LWF_EMP).toBe(21); // ceil(20.5)
    expect(res.values.LWF_ER).toBe(40);
  });

  it('captures a per-component calculation error as a warning and continues', async () => {
    const svc = makeService();
    const res = await svc.calculate(
      structure({
        components: [
          ...standardComponents,
          comp({
            code: 'BONUS',
            calculationMethod: 'FORMULA',
            formula: 'UNKNOWN_VAR * 2',
            displayOrder: 4,
          }),
        ],
      }),
      input(),
    );
    expect(res.values.BONUS).toBe(0);
    expect(res.warnings.some((w) => /BONUS/.test(w))).toBe(true);
    // the rest of the run still computed
    expect(res.values.BASIC).toBe(15000);
  });
});
