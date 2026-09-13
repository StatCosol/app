import { contractorRegisterSource } from './register-contractor-source';
import { registerLayout } from './register-layouts';

const vendor = '11111111-1111-4111-8111-111111111111';
const source = (ds: any, form = 'V') =>
  contractorRegisterSource(
    ds,
    registerLayout('cw', form)!,
    'client',
    'branch',
    vendor,
    2026,
    9,
  );
const database = (data: unknown[]) => ({
  query: jest
    .fn()
    .mockResolvedValueOnce([{ id: vendor, name: 'Example vendor' }])
    .mockResolvedValueOnce(data),
});

describe('Contractor register sources', () => {
  it('rejects an unassigned contractor before accessing worker or payroll records', async () => {
    const ds = { query: jest.fn().mockResolvedValue([]) };
    await expect(source(ds)).rejects.toThrow(/not assigned/);
    expect(ds.query).toHaveBeenCalledTimes(1);
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining('bc.client_id=$1 AND bc.branch_id=$2'),
      ['client', 'branch'],
    );
  });
  it('uses published vendor wages, including payable bonus, without deducting employer costs', async () => {
    const ds = database([
      {
        id: 'published',
        rows_snapshot: [
          {
            employeeCode: 'C001',
            employeeName: 'Sample',
            matchStatus: 'MATCHED',
            grossWage: 18000,
            totalEarnings: 20102,
            netSalary: 18032,
            pfDeduction: 1800,
            esiDeduction: 120,
            employerPf: 1950,
            daysWorked: 30,
          },
        ],
      },
    ]);
    const result = await source(ds);
    expect(result.rows[0]).toMatchObject({
      gross: 20102,
      net: 18032,
      deductions: 2070,
      pf: 1800,
      esi: 120,
      otherDeductions: 150,
    });
    expect(result.rows[0].basicRate).toBeUndefined();
    expect(ds.query).toHaveBeenLastCalledWith(
      expect.stringContaining("status IN ('CRM_APPROVED','VERIFIED_LOCKED')"),
      ['client', 'branch', vendor, '2026-09'],
    );
  });
  it('rejects missing published payroll and unresolved mismatches', async () => {
    await expect(source(database([]))).rejects.toThrow(/No published/);
    await expect(
      source(database([{ rows_snapshot: [{ matchStatus: 'NO_QUOTATION' }] }])),
    ).rejects.toThrow(/mismatches/);
  });
  it('rejects deductions that cannot reconcile with net wages', async () => {
    await expect(
      source(
        database([
          {
            rows_snapshot: [
              {
                matchStatus: 'MATCHED',
                totalEarnings: 100,
                netSalary: 99,
                pfDeduction: 10,
                esiDeduction: 0,
              },
            ],
          },
        ]),
      ),
    ).rejects.toThrow(/do not reconcile/);
  });
  it('preserves bank identifier digits from enrolled workers', async () => {
    const ds = database([
      {
        employee_code: 'C001',
        name: 'Sample',
        bank_account: '00012345678901234567890',
      },
    ]);
    const result = await source(ds, 'I');
    expect(result.rows[0].employee_25).toBe('00012345678901234567890');
    expect(ds.query).toHaveBeenLastCalledWith(
      expect.stringContaining('contractor_user_id=$3'),
      ['client', 'branch', vendor, '2026-09-01', '2026-09-30'],
    );
  });
  it('does not invent daily timings or overtime from approved attendance totals', async () => {
    const ds = database([
      {
        id: 'batch',
        approved_rows_snapshot: [
          { employee_code: 'C001', employee_name: 'Sample', days_worked: 28 },
        ],
      },
    ]);
    const result = await source(ds, 'IX');
    expect(result.rows[0]).toMatchObject({
      employeeCode: 'C001',
      daysWorked: 28,
    });
    expect(result.rows[0].day1In).toBeUndefined();
    expect(result.rows[0].otHours).toBeUndefined();
    expect(ds.query).toHaveBeenLastCalledWith(
      expect.stringContaining('reviewed_by IS NOT NULL'),
      ['client', 'branch', vendor, '2026-09'],
    );
  });
});
