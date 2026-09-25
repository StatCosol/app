import { FaceDeskReportsService } from './facedesk-reports.service';

describe('FaceDeskReportsService.pushToPayroll', () => {
  it('maps approved attendance to biometric ingest items and reports counts', async () => {
    const rows = [
      {
        employeeCode: 'E001',
        punchTime: new Date('2026-07-07T04:00:00.000Z'),
        punchType: 'IN',
        deviceId: 'dev-1',
        branchId: 'b1',
      },
      {
        employeeCode: 'E001',
        punchTime: new Date('2026-07-07T12:00:00.000Z'),
        punchType: 'OUT',
        deviceId: null,
        branchId: null,
      },
    ];
    const dataSource = { query: jest.fn().mockResolvedValue(rows) };
    const ingest = jest.fn(async () => ({ received: 2, inserted: 2 }));
    const biometric = { ingest };
    const service = new FaceDeskReportsService(
      dataSource as any,
      biometric as any,
      {
        getEffective: jest
          .fn()
          .mockResolvedValue({ shiftStartTime: null, shiftEndTime: null }),
      } as any,
      { summarise: jest.fn() } as any,
    );

    const res = await service.pushToPayroll('c1', {
      from: '2026-07-07T00:00:00.000Z',
      to: '2026-07-08T00:00:00.000Z',
    });

    expect(res).toEqual({ pushed: 2, received: 2 });
    const call = ingest.mock.calls[0] as unknown as [string, any[], boolean];
    const clientId = call[0];
    const items = call[1];
    const autoProcess = call[2];
    expect(clientId).toBe('c1');
    expect(autoProcess).toBe(true);
    expect(dataSource.query.mock.calls[0][0]).toContain(
      "rq.status = 'PENDING'",
    );
    expect(items[0]).toEqual(
      expect.objectContaining({
        employeeCode: 'E001',
        direction: 'IN',
        deviceId: 'dev-1',
        branchId: 'b1',
        source: 'MOBILE_KIOSK',
      }),
    );
    // null device falls back to a stable id; null branch → undefined
    expect(items[1].deviceId).toBe('facedesk');
    expect(items[1].branchId).toBeUndefined();
  });

  it('no-ops when there is no approved attendance', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    const biometric = { ingest: jest.fn() };
    const service = new FaceDeskReportsService(
      dataSource as any,
      biometric as any,
      {
        getEffective: jest
          .fn()
          .mockResolvedValue({ shiftStartTime: null, shiftEndTime: null }),
      } as any,
      { summarise: jest.fn() } as any,
    );
    const res = await service.pushToPayroll('c1', {});
    expect(res).toEqual({ pushed: 0, received: 0 });
    expect(biometric.ingest).not.toHaveBeenCalled();
  });
});

describe('FaceDeskReportsService.failedAttempts', () => {
  it('returns enriched FaceDesk failures for the attendance-failures screen', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    const service = new FaceDeskReportsService(
      dataSource as any,
      {} as any,
      {
        getEffective: jest
          .fn()
          .mockResolvedValue({ shiftStartTime: null, shiftEndTime: null }),
      } as any,
      { summarise: jest.fn() } as any,
    );

    await service.failedAttempts('c1', {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-02T00:00:00.000Z',
      branchIds: ['b1'],
    });

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain('LEFT JOIN contractor_employees ce');
    expect(sql).toContain('b.branch_name AS "branchName"');
    expect(sql).toContain('f.best_confidence AS "matchScore"');
    expect(sql).toContain('f.branch_id = ANY($4::uuid[])');
    expect(params).toEqual([
      'c1',
      '2026-08-01T00:00:00.000Z',
      '2026-08-02T00:00:00.000Z',
      ['b1'],
    ]);
  });

  it('returns no rows for a branch user with no assigned branches', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    const service = new FaceDeskReportsService(
      dataSource as any,
      {} as any,
      {
        getEffective: jest
          .fn()
          .mockResolvedValue({ shiftStartTime: null, shiftEndTime: null }),
      } as any,
      { summarise: jest.fn() } as any,
    );

    await service.failedAttempts('c1', { branchIds: [] });

    expect(dataSource.query.mock.calls[0][0]).toContain('AND FALSE');
  });
});

describe('FaceDeskReportsService.workedHoursSummary', () => {
  const makeService = (rows: any[]) => {
    const dataSource = { query: jest.fn().mockResolvedValue(rows) };
    const service = new FaceDeskReportsService(
      dataSource as any,
      {} as any,
      { getEffective: jest.fn() } as any,
      { summarise: jest.fn() } as any,
    );
    return { service, dataSource };
  };

  it('pairs IN->OUT hours into full/short day units and a H:MM string', async () => {
    const { service } = makeService([
      // 9.5h worked, no decision -> FULL, day 1
      {
        employeeCode: 'E1',
        employeeName: 'Full Day',
        branchName: 'HQ',
        day: '2026-08-20',
        punches: 2,
        punchList: '09:00 IN, 18:30 OUT',
        workedSeconds: 9.5 * 3600,
        reviewDecision: null,
      },
      // 8h, no decision -> PENDING_REVIEW, day 0
      {
        employeeCode: 'E2',
        employeeName: 'Short Pending',
        branchName: 'HQ',
        day: '2026-08-20',
        punches: 4,
        punchList: '09:30 IN, 13:00 OUT, 14:00 IN, 18:30 OUT',
        workedSeconds: 8 * 3600,
        reviewDecision: null,
      },
      // 6h but branch APPROVED -> counts as full day 1
      {
        employeeCode: 'E3',
        employeeName: 'Short Approved',
        branchName: null,
        day: '2026-08-20',
        punches: 2,
        punchList: '10:00 IN, 16:00 OUT',
        workedSeconds: 6 * 3600,
        reviewDecision: 'APPROVED',
      },
      // 5h but REJECTED -> day 0
      {
        employeeCode: 'E4',
        employeeName: 'Short Rejected',
        branchName: null,
        day: '2026-08-20',
        punches: 2,
        punchList: '10:00 IN, 15:00 OUT',
        workedSeconds: 5 * 3600,
        reviewDecision: 'REJECTED',
      },
      // 4h but branch marked HALF_DAY -> 0.5
      {
        employeeCode: 'E5',
        employeeName: 'Short Half',
        branchName: null,
        day: '2026-08-20',
        punches: 2,
        punchList: '10:00 IN, 14:00 OUT',
        workedSeconds: 4 * 3600,
        reviewDecision: 'HALF_DAY',
      },
    ]);

    const out = (await service.workedHoursSummary('c1', {})) as any[];

    expect(out[0]).toMatchObject({
      status: 'FULL',
      dayUnit: 1,
      workedHours: '9:30',
      punchList: '09:00 IN, 18:30 OUT',
    });
    expect(out[1]).toMatchObject({
      status: 'PENDING_REVIEW',
      dayUnit: 0,
      workedHours: '8:00',
    });
    expect(out[2]).toMatchObject({
      status: 'APPROVED',
      dayUnit: 1,
      workedHours: '6:00',
      branch: '',
    });
    expect(out[3]).toMatchObject({
      status: 'REJECTED',
      dayUnit: 0,
      workedHours: '5:00',
    });
    expect(out[4]).toMatchObject({
      status: 'HALF_DAY',
      dayUnit: 0.5,
      workedHours: '4:00',
    });
  });
});

describe('FaceDeskReportsService — the kiosk is not employees only', () => {
  const makeService = () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    const summarise = jest.fn().mockResolvedValue({
      from: 'f',
      to: 't',
      rows: [
        { employeeCode: 'SSR0139', employeeName: 'Jetha', daysWorked: 12 },
      ],
      unpayable: [
        { employeeCode: null, employeeName: 'No Code', daysWorked: 3 },
      ],
    });
    const service = new FaceDeskReportsService(
      dataSource as any,
      {} as any,
      { getEffective: jest.fn().mockResolvedValue({}) } as any,
      { summarise } as any,
    );
    return { service, dataSource, summarise };
  };

  // Contractor punches live in their own table. Reading only the attendance
  // logs left these reports describing a kiosk without its contractors.
  it.each([
    ['dailyAttendance'],
    ['employeeSummary'],
    ['workedHoursSummary'],
    ['branchSummary'],
  ])('%s reads contractor punches as well as employee ones', async (method) => {
    const { service, dataSource } = makeService();
    await (service as any)[method]('c1', {});
    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain('contractor_biometric_punches');
    expect(sql).toContain('facedesk_attendance_logs');
  });

  it('counts an enrolled contractor who never punched as absent', async () => {
    const { service, dataSource } = makeService();
    await service.absent('c1', {});
    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain('contractor_employees ce');
    expect(sql).toContain(`p.subject_type = 'CONTRACTOR'`);
  });

  // Payroll is deliberately left alone: contractor punches reach payroll
  // through their own pipeline, so pushing them here would pay twice.
  it('does not push contractor punches into payroll', async () => {
    const { service, dataSource } = makeService();
    await service.pushToPayroll('c1', {});
    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain('facedesk_attendance_logs');
    expect(sql).not.toContain('contractor_biometric_punches');
  });

  // The client pays these workers, so the number their wages come from has to
  // be visible; those with no employee_code are the ones who go unpaid.
  it('returns days worked, flagging who cannot be matched to a wage line', async () => {
    const { service, summarise } = makeService();
    const rows = await service.contractorDays('c1', {});
    expect(summarise).toHaveBeenCalled();
    expect(rows).toEqual([
      {
        employeeCode: 'SSR0139',
        employeeName: 'Jetha',
        daysWorked: 12,
        payable: true,
      },
      {
        employeeCode: null,
        employeeName: 'No Code',
        daysWorked: 3,
        payable: false,
      },
    ]);
  });
});
