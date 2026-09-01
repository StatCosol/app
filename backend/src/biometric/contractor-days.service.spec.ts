import { ContractorDaysService } from './contractor-days.service';

describe('ContractorDaysService', () => {
  const makeService = (rows: any[]) => {
    const query = jest.fn().mockResolvedValue(rows);
    const punchRepo = { manager: { query } };
    return {
      service: new ContractorDaysService(punchRepo as any),
      query,
    };
  };

  const row = (over: Partial<Record<string, any>> = {}) => ({
    contractorEmployeeId: 'worker-1',
    contractorUserId: 'contractor-a',
    employeeCode: 'W001',
    punchCode: '1047',
    employeeName: 'A Worker',
    skillCategory: 'UNSKILLED',
    daysWorked: 22,
    firstPunch: '2026-08-01T03:30:00.000Z',
    lastPunch: '2026-08-30T12:30:00.000Z',
    ...over,
  });

  it('counts distinct business days rather than pairing IN/OUT', async () => {
    // eSSL sends AUTO whenever the worker does not press the in/out key, so
    // pairing would undercount and underpay. The query must count dates.
    const { service, query } = makeService([row()]);

    await service.summarise('client-1', '2026-08-01', '2026-08-31');

    const [sql] = query.mock.calls[0];
    expect(sql).toContain('COUNT(DISTINCT');
    expect(sql).not.toMatch(/direction\s*=\s*'IN'/);
  });

  it('excludes punches still awaiting face review', async () => {
    const { service, query } = makeService([]);

    await service.summarise('client-1', '2026-08-01', '2026-08-31');

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("p.decision IN ('AUTO', 'REVIEW_APPROVED')");
  });

  it('shifts punch times into IST before deciding the day', async () => {
    const { service, query } = makeService([]);

    await service.summarise('client-1', '2026-08-01', '2026-08-31');

    const [, params] = query.mock.calls[0];
    expect(params).toContain('330');
  });

  it('separates workers who have attendance but no employee code', async () => {
    // The muster sheet is keyed on employee_code, so a blank one means the
    // worker cannot be matched to a wage line and would go unpaid.
    const { service } = makeService([
      row(),
      row({
        contractorEmployeeId: 'worker-2',
        employeeCode: null,
        employeeName: 'No Code',
      }),
      row({
        contractorEmployeeId: 'worker-3',
        employeeCode: '   ',
        employeeName: 'Blank Code',
      }),
    ]);

    const out = await service.summarise('client-1', '2026-08-01', '2026-08-31');

    expect(out.rows).toHaveLength(3);
    expect(out.unpayable.map((r) => r.employeeName)).toEqual([
      'No Code',
      'Blank Code',
    ]);
  });

  it('narrows to one contractor when asked', async () => {
    const { service, query } = makeService([]);

    await service.summarise(
      'client-1',
      '2026-08-01',
      '2026-08-31',
      'contractor-a',
    );

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('ce.contractor_user_id =');
    expect(params).toContain('contractor-a');
  });

  it('shapes muster rows to the columns the computation upload accepts', async () => {
    const { service } = makeService([row()]);

    const rows = await service.asMusterRows(
      'client-1',
      '2026-08-01',
      '2026-08-31',
    );

    expect(rows).toEqual([
      {
        employee_code: 'W001',
        employee_name: 'A Worker',
        skill_category: 'UNSKILLED',
        days_worked: 22,
      },
    ]);
  });
});
