import { BiometricService } from './biometric.service';

describe('BiometricService', () => {
  const makeService = (opts: {
    dayPunches: any[];
    existing?: any;
    contractorEmpRepo?: any;
    contractorPunchRepo?: any;
  }) => {
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
      opts.contractorEmpRepo ?? {},
      opts.contractorPunchRepo ?? {},
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
        // The day contains a kiosk punch, so it is face-verified even though
        // the check-in came from a fingerprint device.
        captureMethod: 'FACE',
      }),
    );
  });

  it('requires review when a face punch shares the day with an eSSL device punch', async () => {
    const { service, attRepo } = makeService({
      dayPunches: [
        {
          id: 'punch-gate-in',
          punchTime: new Date('2026-07-04T03:30:00.000Z'),
          direction: 'IN',
          source: 'DEVICE',
        },
        {
          id: 'punch-kiosk-out',
          punchTime: new Date('2026-07-04T12:30:00.000Z'),
          direction: 'OUT',
          source: 'MOBILE_KIOSK',
        },
      ],
    });

    await (service as any).processAffectedDays('client-1', [
      { employeeId: 'employee-1', date: '2026-07-04' },
    ]);

    // A single fingerprint punch must not clear the face-review requirement
    // for the whole day and push an unreviewed face match into payroll.
    expect(attRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        captureMethod: 'FACE',
        approvalStatus: 'PENDING',
      }),
    );
  });

  it('auto-approves a day made up only of eSSL device punches', async () => {
    const { service, attRepo } = makeService({
      dayPunches: [
        {
          id: 'punch-in',
          punchTime: new Date('2026-07-04T03:30:00.000Z'),
          direction: 'IN',
          source: 'DEVICE',
        },
        {
          id: 'punch-out',
          punchTime: new Date('2026-07-04T12:30:00.000Z'),
          direction: 'OUT',
          source: 'DEVICE',
        },
      ],
    });

    await (service as any).processAffectedDays('client-1', [
      { employeeId: 'employee-1', date: '2026-07-04' },
    ]);

    expect(attRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        captureMethod: 'BIOMETRIC',
        approvalStatus: 'APPROVED',
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
      {} as any,
      {} as any,
    );
    const ingest = jest.spyOn(service, 'ingest').mockResolvedValue({
      received: 1,
      inserted: 1,
      duplicates: 0,
      unknownEmployees: [],
      ambiguousEmployees: [],
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
      {} as any,
      {} as any,
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

describe('BiometricService — contractor devices', () => {
  const makeContractorService = (workers: any[]) => {
    const rawInsert = { values: null as any };
    const contractorInsert = { values: null as any };

    const builder = (sink: { values: any }) => ({
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn(function (this: any, v: any) {
        sink.values = v;
        return this;
      }),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({
        identifiers: (sink.values ?? []).map((_: any, i: number) => ({
          id: `row-${i}`,
        })),
      })),
    });

    const punchRepo = { createQueryBuilder: jest.fn(() => builder(rawInsert)) };
    const contractorPunchRepo = {
      createQueryBuilder: jest.fn(() => builder(contractorInsert)),
    };
    const contractorEmpRepo = {
      find: jest.fn(async (_opts?: any) => workers),
    };
    // The splitter searches both populations; no on-roll staff hold these codes.
    const empRepo = { find: jest.fn(async (_opts?: any) => [] as any[]) };

    const service = new BiometricService(
      punchRepo as any,
      empRepo as any,
      {} as any,
      contractorEmpRepo as any,
      contractorPunchRepo as any,
    );
    return { service, contractorEmpRepo, empRepo, rawInsert, contractorInsert };
  };

  const device = {
    id: 'device-uuid-1',

    contractorUserId: null,
  };

  const punch = (code: string) => ({
    employeeCode: code,
    punchTime: '2026-08-31T03:30:00.000Z',
    direction: 'IN' as const,
    deviceId: 'SN123',
  });

  it('attributes a punch to the contractor worker holding that code', async () => {
    const { service, contractorInsert } = makeContractorService([
      {
        id: 'worker-1',
        employeeCode: 'W001',
        branchId: 'branch-1',
        contractorUserId: 'contractor-a',
      },
    ]);

    const result = await service.ingest(
      'client-1',
      [punch('W001')],
      true,
      undefined,
      device,
    );

    expect(result.unknownEmployees).toEqual([]);
    expect(result.ambiguousEmployees).toEqual([]);
    expect(contractorInsert.values).toEqual([
      expect.objectContaining({
        contractorEmployeeId: 'worker-1',
        deviceId: 'device-uuid-1',
        decision: 'AUTO',
      }),
    ]);
  });

  it('leaves a code held by two contractors unattributed rather than guessing', async () => {
    // Same code under two contractors: attributing it would post one
    // contractor's hours onto the other's wage bill.
    const { service, contractorInsert, rawInsert } = makeContractorService([
      {
        id: 'worker-a',
        employeeCode: 'W001',
        branchId: 'b1',
        contractorUserId: 'contractor-a',
      },
      {
        id: 'worker-b',
        employeeCode: 'W001',
        branchId: 'b2',
        contractorUserId: 'contractor-b',
      },
    ]);

    const result = await service.ingest(
      'client-1',
      [punch('W001')],
      true,
      undefined,
      device,
    );

    expect(result.ambiguousEmployees).toEqual(['W001']);
    expect(result.unknownEmployees).toEqual([]);
    // Nothing posted to contractor attendance...
    expect(contractorInsert.values).toBeNull();
    // ...but the raw punch is kept, unattributed, so it is recoverable.
    expect(rawInsert.values).toEqual([
      expect.objectContaining({
        employeeCode: 'W001',
        contractorEmployeeId: null,
      }),
    ]);
  });

  it('reports an unmatched code as unknown and keeps the raw punch', async () => {
    const { service, contractorInsert, rawInsert } = makeContractorService([]);

    const result = await service.ingest(
      'client-1',
      [punch('W404')],
      true,
      undefined,
      device,
    );

    expect(result.unknownEmployees).toEqual(['W404']);
    expect(result.ambiguousEmployees).toEqual([]);
    // A code nobody holds is not contractor-bound, so it stays on the employee
    // path and is recorded unlinked there — reconcile can still claim it.
    expect(contractorInsert.values).toBeNull();
    expect(rawInsert.values).toEqual([
      expect.objectContaining({ employeeCode: 'W404', employeeId: null }),
    ]);
  });

  it('narrows to one contractor when the device is pinned to one', async () => {
    const { service, contractorEmpRepo } = makeContractorService([
      {
        id: 'worker-a',
        employeeCode: 'W001',
        branchId: 'b1',
        contractorUserId: 'contractor-a',
      },
    ]);

    await service.ingest('client-1', [punch('W001')], true, undefined, {
      ...device,
      contractorUserId: 'contractor-a',
    });

    // Both lookup tiers are scoped to the pinned contractor.
    const [{ where }] = contractorEmpRepo.find.mock.calls[0];
    expect(where).toHaveLength(2);
    for (const clause of where) {
      expect(clause).toEqual(
        expect.objectContaining({ contractorUserId: 'contractor-a' }),
      );
    }
  });

  it('prefers the device-generated punch code over an unrelated HR code', async () => {
    // The machine allocates its own User ID, so a punch carries the punch code.
    // Another worker whose HR code happens to equal that number must not win.
    const { service, contractorInsert } = makeContractorService([
      {
        id: 'worker-punch',
        punchCode: '7',
        employeeCode: 'W900',
        branchId: 'b1',
        contractorUserId: 'contractor-a',
      },
      {
        id: 'worker-hr',
        punchCode: null,
        employeeCode: '7',
        branchId: 'b2',
        contractorUserId: 'contractor-b',
      },
    ]);

    const result = await service.ingest(
      'client-1',
      [punch('7')],
      true,
      undefined,
      device,
    );

    expect(result.ambiguousEmployees).toEqual([]);
    expect(contractorInsert.values).toEqual([
      expect.objectContaining({ contractorEmployeeId: 'worker-punch' }),
    ]);
  });

  it('falls back to the HR code when no punch code is recorded', async () => {
    const { service, contractorInsert } = makeContractorService([
      {
        id: 'worker-1',
        punchCode: null,
        employeeCode: 'W001',
        branchId: 'b1',
        contractorUserId: 'contractor-a',
      },
    ]);

    const result = await service.ingest(
      'client-1',
      [punch('W001')],
      true,
      undefined,
      device,
    );

    expect(result.unknownEmployees).toEqual([]);
    expect(contractorInsert.values).toEqual([
      expect.objectContaining({ contractorEmployeeId: 'worker-1' }),
    ]);
  });

  it('does not roll contractor punches into attendance_records', async () => {
    // Contractor attendance is not stored there; a stray upsert would create
    // an employee attendance row for a contractor worker.
    const { service } = makeContractorService([
      {
        id: 'worker-1',
        employeeCode: 'W001',
        branchId: 'b1',
        contractorUserId: 'contractor-a',
      },
    ]);

    const result = await service.ingest(
      'client-1',
      [punch('W001')],
      true,
      undefined,
      device,
    );

    expect(result.attendanceUpserts).toBe(0);
    expect(result.affectedDays).toEqual([]);
  });
});
