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

describe('branch states within one payroll run', () => {
  const service: any = Object.create(PayrollEngineService.prototype);
  it('reads each branch once, however many employees it has', async () => {
    const states: Record<string, string> = { hyd: 'TS', blr: 'KA' };
    const query = jest.fn(async (_sql: string, params: unknown[]) => [
      { statecode: states[String(params[0])] },
    ]);
    const branchStates = new Map<string, string>();
    const run = ['hyd', 'blr', 'hyd', 'hyd', 'blr', 'hyd'];
    const resolved: string[] = [];
    for (const branchId of run)
      resolved.push(
        await service.resolveWorkStateCode(branchId, 'MH', query, branchStates),
      );
    expect(resolved).toEqual(['TS', 'KA', 'TS', 'TS', 'KA', 'TS']);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('remembers a branch with no state instead of asking again', async () => {
    const query = jest.fn(async () => [{ statecode: null }]);
    const branchStates = new Map<string, string>();
    await expect(
      service.resolveWorkStateCode('remote', 'MH', query, branchStates),
    ).resolves.toBe('MH');
    await expect(
      service.resolveWorkStateCode('remote', 'KL', query, branchStates),
    ).resolves.toBe('KL');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
