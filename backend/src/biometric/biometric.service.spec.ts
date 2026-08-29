import { BiometricService } from './biometric.service';

describe('BiometricService', () => {
  const makeService = (opts: { dayPunches: any[]; existing?: any }) => {
    const updateExecute = jest.fn(async () => ({
      affected: opts.dayPunches.length,
    }));
    const punchRepo = {
      find: jest.fn(async () => opts.dayPunches),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: updateExecute,
      })),
    };
    const empRepo = {
      findOne: jest.fn(async () => ({
        id: 'employee-1',
        clientId: 'client-1',
        branchId: 'branch-1',
        employeeCode: 'E001',
      })),
    };
    const attRepo = {
      findOne: jest.fn(async () => opts.existing ?? null),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => ({ id: row.id ?? 'attendance-1', ...row })),
    };
    const service = new BiometricService(
      punchRepo as any,
      empRepo as any,
      attRepo as any,
    );

    return { service, punchRepo, empRepo, attRepo, updateExecute };
  };

  it('uses an explicit mobile OUT punch as daily attendance checkout after an AUTO checkin', async () => {
    const { service, attRepo } = makeService({
      dayPunches: [
        {
          id: 'punch-in',
          punchTime: new Date('2026-07-04T03:30:00.000Z'),
          direction: 'AUTO',
          source: 'DEVICE',
        },
        {
          id: 'punch-out',
          punchTime: new Date('2026-07-04T12:30:00.000Z'),
          direction: 'OUT',
          source: 'MOBILE_KIOSK',
        },
      ],
    });

    await (service as any).processAffectedDays('client-1', [
      { employeeId: 'employee-1', date: '2026-07-04' },
    ]);

    expect(attRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        checkIn: '09:00:00',
        checkOut: '18:00:00',
        workedHours: '9.00',
        captureMethod: 'BIOMETRIC',
      }),
    );
  });

  it('uses explicit mobile IN and OUT punches for face-only daily attendance', async () => {
    const { service, attRepo } = makeService({
      dayPunches: [
        {
          id: 'punch-in',
          punchTime: new Date('2026-07-04T03:45:00.000Z'),
          direction: 'IN',
          source: 'MOBILE_KIOSK',
        },
        {
          id: 'punch-out',
          punchTime: new Date('2026-07-04T12:15:00.000Z'),
          direction: 'OUT',
          source: 'MOBILE_KIOSK',
        },
      ],
    });

    await (service as any).processAffectedDays('client-1', [
      { employeeId: 'employee-1', date: '2026-07-04' },
    ]);

    expect(attRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        checkIn: '09:15:00',
        checkOut: '17:45:00',
        workedHours: '8.50',
        captureMethod: 'FACE',
        approvalStatus: 'PENDING',
      }),
    );
  });

  it('backfills eligible FaceDesk punches while excluding pending reviews', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        employeeCode: 'E001',
        punchTime: new Date('2026-08-02T03:30:00.000Z'),
        punchType: 'IN',
        deviceId: null,
        branchId: 'branch-1',
      },
    ]);
    const punchRepo = { manager: { query } };
    const service = new BiometricService(
      punchRepo as any,
      {} as any,
      {} as any,
    );
    const ingest = jest.spyOn(service, 'ingest').mockResolvedValue({
      received: 1,
      inserted: 1,
      duplicates: 0,
      unknownEmployees: [],
      attendanceUpserts: 0,
      affectedDays: [],
    });

    await service.syncFaceDeskRange('client-1', '2026-08-02', '2026-08-02');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("rq.status = 'PENDING'");
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain("COALESCE(a.device_id::text, 'facedesk')");
    expect(params).toEqual([
      'client-1',
      new Date('2026-08-01T18:30:00.000Z'),
      new Date('2026-08-02T18:29:59.999Z'),
    ]);
    expect(ingest).toHaveBeenCalledWith(
      'client-1',
      [
        expect.objectContaining({
          employeeCode: 'E001',
          direction: 'IN',
          deviceId: 'facedesk',
          source: 'MOBILE_KIOSK',
        }),
      ],
      false,
    );
  });
});

describe('BiometricService — attendance insert race', () => {
  // The reconcile runs from GET handlers the UI fires in parallel, so another
  // writer can create the employee/day row between our lookup and our insert.
  const makeRacingService = (winner: any) => {
    const updateExecute = jest.fn(async () => ({ affected: 1 }));
    const punchRepo = {
      find: jest.fn(async () => [
        {
          id: 'punch-in',
          punchTime: new Date('2026-07-04T03:30:00.000Z'),
          direction: 'AUTO',
          source: 'DEVICE',
        },
      ]),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: updateExecute,
      })),
    };
    const empRepo = {
      findOne: jest.fn(async () => ({
        id: 'employee-1',
        clientId: 'client-1',
        branchId: 'branch-1',
        employeeCode: 'E001',
      })),
    };
    let lookups = 0;
    const attRepo = {
      // First lookup (before insert) sees nothing; the post-conflict re-read
      // returns the row the winner created.
      findOne: jest.fn(async () => (lookups++ === 0 ? null : winner)),
      create: jest.fn((row) => row),
      merge: jest.fn((a: any, b: any) => Object.assign({}, a, b)),
      save: jest.fn(async (row) => {
        if (!row.id) {
          const err: any = new Error('duplicate key');
          err.code = '23505';
          throw err;
        }
        return row;
      }),
    };
    const service = new BiometricService(
      punchRepo as any,
      empRepo as any,
      attRepo as any,
    );
    return { service, attRepo, updateExecute };
  };

  it('does not overwrite a manual entry that won the race', async () => {
    const manual = {
      id: 'attendance-manual',
      source: 'MANUAL',
      checkIn: '09:15',
      status: 'PRESENT',
      approvalStatus: 'APPROVED',
    };
    const { service, attRepo, updateExecute } = makeRacingService(manual);

    await (service as any).processAffectedDays('client-1', [
      { employeeId: 'employee-1', date: '2026-07-04' },
    ]);

    // The only save attempted is the insert that lost; the manual row is never
    // written over, and the punches are not linked to it.
    const overwrote = attRepo.save.mock.calls.some(
      ([row]: any[]) => row?.id === 'attendance-manual',
    );
    expect(overwrote).toBe(false);
    expect(updateExecute).not.toHaveBeenCalled();
  });

  it('adopts a biometric row that won the race', async () => {
    const biometric = {
      id: 'attendance-bio',
      source: 'BIOMETRIC',
      checkIn: '09:00',
    };
    const { service, attRepo, updateExecute } = makeRacingService(biometric);

    await (service as any).processAffectedDays('client-1', [
      { employeeId: 'employee-1', date: '2026-07-04' },
    ]);

    const adopted = attRepo.save.mock.calls.some(
      ([row]: any[]) => row?.id === 'attendance-bio',
    );
    expect(adopted).toBe(true);
    expect(updateExecute).toHaveBeenCalled();
  });
});
