import { PayrollEngineService } from './payroll-engine.service';

/**
 * PT, LWF and the minimum wage are the working state's. One client can run a
 * single payroll across branches in several states, so each employee is due
 * the rates of the state their branch is in.
 */
describe('the state an employee is taxed in', () => {
  const service: any = Object.create(PayrollEngineService.prototype);
  const branches: Record<string, string> = { hyd: 'TS', blr: 'KA', remote: '' };
  const query = jest.fn(async (_sql: string, params: unknown[]) =>
    params[0] === 'missing' ? [] : [{ statecode: branches[String(params[0])] }],
  );
  const resolve = (branchId: string | null, own: string | null) =>
    service.resolveWorkStateCode(branchId, own, query);

  it('uses the branch the employee works at, not their own state', async () => {
    await expect(resolve('hyd', 'MH')).resolves.toBe('TS');
    await expect(resolve('blr', 'MH')).resolves.toBe('KA');
  });

  it('falls back to the employee when the branch has no state', async () => {
    await expect(resolve('remote', 'MH')).resolves.toBe('MH');
    await expect(resolve('missing', 'MH')).resolves.toBe('MH');
    await expect(resolve(null, 'MH')).resolves.toBe('MH');
  });

  it('answers with nothing when neither has a state, and never queries without a branch', async () => {
    query.mockClear();
    await expect(resolve(null, '')).resolves.toBe('');
    await expect(resolve('remote', null)).resolves.toBe('');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
