import { ContractorEmployeesService } from './contractor-employees.service';
import { pendingDetails } from './entities/contractor-employee.entity';

/**
 * A worker can be enrolled before their documents arrive. The record then has
 * to say what is outstanding, and the office needs to be able to list exactly
 * those workers to chase them.
 */
describe('details a worker still owes', () => {
  it('names each missing detail, counting blanks and spaces as missing', () => {
    expect(
      pendingDetails({
        aadhaar: '123456789012',
        pan: 'ABCDE1234F',
        bankAccount: '001',
      }),
    ).toEqual([]);
    expect(
      pendingDetails({
        aadhaar: '123456789012',
        pan: null,
        bankAccount: '   ',
      }),
    ).toEqual(['pan', 'bankAccount']);
    expect(pendingDetails({})).toEqual(['aadhaar', 'pan', 'bankAccount']);
  });
});

describe('listing by what is outstanding', () => {
  const builder = () => {
    const qb: any = { conditions: [] as string[] };
    for (const m of ['where', 'orderBy']) qb[m] = () => qb;
    qb.andWhere = (sql: string) => {
      qb.conditions.push(sql);
      return qb;
    };
    qb.getManyAndCount = async () => [[], 0];
    return qb;
  };
  const service = (qb: any) => {
    const svc: any = Object.create(ContractorEmployeesService.prototype);
    svc.repo = { createQueryBuilder: () => qb };
    return svc;
  };
  const pendingSql = (qb: any) =>
    qb.conditions.filter((c: string) => c.includes('aadhaar')).join(' ');

  it.each([
    ['list', (svc: any) => svc.list('contractor', { detailsPending: true })],
    [
      'listByBranch',
      (svc: any) =>
        svc.listByBranch('client', 'branch', { detailsPending: true }),
    ],
  ])('%s asks only for workers still owing something', async (_name, call) => {
    const qb = builder();
    await call(service(qb));
    const sql = pendingSql(qb);
    expect(sql).toContain("COALESCE(TRIM(ce.aadhaar), '') = ''");
    expect(sql).toContain('OR');
    expect(sql).not.toContain('NOT (');
  });

  it('can ask for the complete records instead', async () => {
    const qb = builder();
    await service(qb).list('contractor', { detailsPending: false });
    expect(pendingSql(qb)).toContain('NOT (');
  });

  it('leaves the listing alone when the filter is not used', async () => {
    const qb = builder();
    await service(qb).list('contractor', {});
    expect(pendingSql(qb)).toBe('');
  });
});
