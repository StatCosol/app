import { registerOperationalSource } from './register-operational-source';

describe('Register operational data sources', () => {
  it('uses approved branch employee profiles without guessing missing pay or identifiers', async () => {
    const ds: any = {
      query: jest.fn().mockResolvedValue([
        {
          employee_code: 'E001',
          name: 'Sample',
          bank_account: '000012345678901234567890',
          date_of_joining: '2026-01-01',
        },
      ]),
    };
    const result = await registerOperationalSource(
      ds,
      'I',
      'client',
      'branch',
      2026,
      9,
    );
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining("approval_status='APPROVED'"),
      ['client', 'branch', '2026-09-01', '2026-09-30'],
    );
    expect(result.rows[0]).toMatchObject({
      employee_1: 'E001',
      employee_25: '000012345678901234567890',
    });
    expect(result.rows[0].employee_15).toBeUndefined();
  });
  it('keeps missing daily attendance and monthly totals unfilled', async () => {
    const ds: any = {
      query: jest.fn().mockResolvedValue([
        {
          employee_id: 'e1',
          employee_code: 'E1',
          name: 'Sample',
          date: '2026-09-01',
          status: 'PRESENT',
          check_in: '09:00:00',
          check_out: '17:00:00',
          overtime_hours: '0',
        },
      ]),
    };
    const result = await registerOperationalSource(
      ds,
      'IX',
      'client',
      'branch',
      2026,
      9,
    );
    expect(result.rows[0]).toMatchObject({
      day1In: '09:00:00',
      day1Out: '17:00:00',
    });
    expect(result.rows[0].day2In).toBeUndefined();
    expect(result.rows[0].daysWorked).toBeUndefined();
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining("a.approval_status='APPROVED'"),
      ['client', 'branch', '2026-09-01', '2026-09-30'],
    );
  });
  it('calculates complete-month totals and retains explicit non-working-day codes', async () => {
    const records = Array.from({ length: 30 }, (_, i) => ({
      employee_id: 'e1',
      employee_code: 'E1',
      name: 'Sample',
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      status: i === 0 ? 'WEEK_OFF' : 'PRESENT',
      check_in: '09:00:00',
      check_out: '17:00:00',
      overtime_hours: '0.5',
    }));
    const result = await registerOperationalSource(
      { query: async () => records } as any,
      'IX',
      'client',
      'branch',
      2026,
      9,
    );
    expect(result.rows[0]).toMatchObject({
      day1In: 'WO',
      day1Out: 'WO',
      daysWorked: 29,
      otHours: 15,
    });
  });
  it('rejects duplicated days, empty sources and oversized branches', async () => {
    const row = {
      employee_id: 'e1',
      employee_code: 'E1',
      name: 'Sample',
      date: '2026-09-01',
      status: 'ABSENT',
      overtime_hours: '0',
    };
    await expect(
      registerOperationalSource(
        { query: async () => [row, row] } as any,
        'IX',
        'c',
        'b',
        2026,
        9,
      ),
    ).rejects.toThrow(/Duplicate/);
    await expect(
      registerOperationalSource(
        { query: async () => [] } as any,
        'I',
        'c',
        'b',
        2026,
        9,
      ),
    ).rejects.toThrow(/approved employee/);
    await expect(
      registerOperationalSource(
        { query: async () => Array(501).fill({}) } as any,
        'I',
        'c',
        'b',
        2026,
        9,
      ),
    ).rejects.toThrow(/500/);
  });
});

describe('Leave and incident evidence', () => {
  it('uses only approved earned leave in the selected branch and preserves missing entitlement', async () => {
    const ds: any = {
      query: jest.fn().mockResolvedValue([
        {
          employee_code: 'E1',
          name: 'Sample',
          id: 'leave1',
          from_date: '2026-09-10',
          to_date: '2026-09-12',
          total_days: '3',
        },
      ]),
    };
    const result = await registerOperationalSource(
      ds,
      'LEAVE',
      'client',
      'branch',
      2026,
      9,
    );
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining("l.leave_type='EL'"),
      ['client', 'branch', '2026-09-01', '2026-09-30'],
    );
    expect(result.rows[0]).toMatchObject({
      employeeCode: 'E1',
      leaveAllowedFrom: '2026-09-10',
    });
    expect(result.rows[0].carryForward).toBeUndefined();
    expect(result.rows[0].workerRegisterSerial).toBeUndefined();
    expect(result.rows[0].leaveWages).toBeUndefined();
  });
  it('does not derive accident entries from payroll or attendance', async () => {
    const ds: any = { query: jest.fn() };
    await expect(
      registerOperationalSource(ds, 'EVENT', 'client', 'branch', 2026, 9),
    ).rejects.toThrow(/incident/);
    expect(ds.query).not.toHaveBeenCalled();
  });
});
