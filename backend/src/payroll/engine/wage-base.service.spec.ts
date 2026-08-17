import { WageBaseService } from './wage-base.service';
import { PayrollComponentEntity } from '../entities/payroll-component.entity';

const comp = (
  code: string,
  opts: { pf?: boolean; esi?: boolean; type?: string } = {},
) =>
  ({
    code,
    componentType: opts.type ?? 'EARNING',
    affectsPfWage: opts.pf ?? false,
    affectsEsiWage: opts.esi ?? false,
  }) as unknown as PayrollComponentEntity;

describe('WageBaseService.computeWageBases', () => {
  let svc: WageBaseService;
  beforeEach(() => {
    svc = new WageBaseService();
  });

  it('sums gross and derives PF/ESI wage from component flags', () => {
    const r = svc.computeWageBases({
      values: { BASIC: 20000, HRA: 8000 },
      components: [
        comp('BASIC', { pf: true, esi: true }),
        comp('HRA', { esi: true }),
      ],
    });
    expect(r.gross).toBe(28000);
    expect(r.pfWage).toBe(20000); // only BASIC affects PF
    expect(r.esiWage).toBe(28000); // BASIC + HRA affect ESI
  });

  it('falls back to gross for PF/ESI wage when no component flags are set', () => {
    const r = svc.computeWageBases({
      values: { BASIC: 15000 },
      components: [comp('BASIC')],
    });
    expect(r.gross).toBe(15000);
    expect(r.pfWage).toBe(15000);
    expect(r.esiWage).toBe(15000);
  });

  it('ignores non-EARNING components', () => {
    const r = svc.computeWageBases({
      values: { BASIC: 20000, PF_EMP: 1800 },
      components: [
        comp('BASIC', { pf: true }),
        comp('PF_EMP', { type: 'DEDUCTION' }),
      ],
    });
    expect(r.gross).toBe(20000); // deduction excluded
  });

  it('returns zeros when there are no earnings', () => {
    const r = svc.computeWageBases({ values: {}, components: [] });
    expect(r).toEqual({ pfWage: 0, esiWage: 0, gross: 0 });
  });
});
