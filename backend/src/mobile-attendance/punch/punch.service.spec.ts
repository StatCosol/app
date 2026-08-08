import { PunchService } from './punch.service';
import { PunchDirectionService } from './punch-direction.service';
import { MobileAttendanceDeviceEntity } from '../devices/device.entity';

describe('PunchService', () => {
  const embedding = new Float32Array([1, 0, 0, 0]);
  const embeddingB64 = Buffer.from(embedding.buffer).toString('base64');
  const embeddingBuffer = Buffer.from(embedding.buffer);
  const makeEmbeddingBufferForCosine = (cosine: number) =>
    Buffer.from(
      new Float32Array([
        cosine,
        Math.sqrt(Math.max(0, 1 - cosine * cosine)),
        0,
        0,
      ]).buffer,
    );

  const makeService = (rows: {
    employeeRows?: any[];
    contractorRows?: any[];
    thresholdRows?: any[];
    cooldownRows?: any[];
    todayRows?: any[];
  }) => {
    const punchRepo = {
      save: jest.fn(async (row) => ({ id: 'punch-1', ...row })),
    };
    const contractorPunchRepo = {
      save: jest.fn(async (row) => ({ id: 'contractor-punch-1', ...row })),
    };
    const biometricService = {
      ingest: jest.fn(async () => ({ attendanceUpserts: 1 })),
    };
    const transactionManager = {
      getRepository: jest.fn(() => punchRepo),
    };
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce(rows.employeeRows ?? [])
        .mockResolvedValueOnce(rows.contractorRows ?? [])
        .mockResolvedValueOnce(rows.thresholdRows ?? [])
        .mockResolvedValueOnce(rows.cooldownRows ?? [])
        .mockResolvedValueOnce(rows.todayRows ?? []),
      transaction: jest.fn(async (callback) => callback(transactionManager)),
    };

    const directionService = new PunchDirectionService(
      dataSource as any,
      biometricService as any,
    );

    const service = new PunchService(
      {} as any,
      {} as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      punchRepo as any,
      contractorPunchRepo as any,
      { livenessRequired: false } as any,
      { uploadPhoto: jest.fn() } as any,
      { enabled: false } as any,
      { appendTemplate: jest.fn().mockResolvedValue(undefined) } as any,
      biometricService as any,
      dataSource as any,
      directionService,
      {
        listContractorPunches: jest.fn(),
        createContractorPunch: jest.fn(),
        updateContractorPunch: jest.fn(),
        deleteContractorPunch: jest.fn(),
      } as any,
      {
        listReviewPunches: jest.fn(),
        reviewPunch: jest.fn(),
        getPunchPhoto: jest.fn(),
      } as any,
    );

    return {
      service,
      punchRepo,
      contractorPunchRepo,
      biometricService,
      dataSource,
      transactionManager,
    };
  };

  const device = {
    id: 'device-1',
    clientId: 'client-1',
    branchId: 'branch-1',
    mode: 'KIOSK',
  } as MobileAttendanceDeviceEntity;

  const dto = {
    embeddingB64,
    embeddingModel: 'mobilefacenet',
    direction: 'IN' as const,
    punchTime: '2026-07-04T02:30:00.000Z',
    isMockLocation: false,
    isRooted: false,
    offlineSync: false,
  };

  it('mirrors accepted employee face punches into the daily attendance pipeline', async () => {
    const { service, biometricService, dataSource, transactionManager } =
      makeService({
        employeeRows: [
          {
            employeeId: 'employee-1',
            name: 'Employee One',
            employeeCode: 'E001',
            embedding: embeddingBuffer,
            embeddingModel: 'mobilefacenet',
            enrolledAt: new Date(Date.now() - 60_000),
          },
        ],
      });

    await service.recordPunch(device, dto);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(biometricService.ingest).toHaveBeenCalledWith(
      'client-1',
      [
        {
          employeeCode: 'E001',
          punchTime: '2026-07-04T02:30:00.000Z',
          direction: 'IN',
          deviceId: 'device-1',
          branchId: 'branch-1',
          source: 'MOBILE_KIOSK',
        },
      ],
      true,
      transactionManager,
    );
  });

  it('scopes employee kiosk roster by current or stored enrollment branch', async () => {
    const { service, dataSource } = makeService({
      employeeRows: [
        {
          employeeId: 'employee-1',
          name: 'Employee One',
          employeeCode: 'E001',
          embedding: embeddingBuffer,
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
      contractorRows: [],
    });

    const roster = await service.getRoster(device);

    expect(roster).toHaveLength(1);
    expect(roster[0]).toEqual(
      expect.objectContaining({
        subjectType: 'EMPLOYEE',
        subjectId: 'employee-1',
        displayName: 'Employee One',
        employeeCode: 'E001',
      }),
    );
    const empSql = dataSource.query.mock.calls[0][0] as string;
    expect(empSql).toContain('e.branch_id = $2 OR fe.branch_id = $2');
    // Unassigned subjects (no branch on employee OR enrollment) must stay
    // visible to branch kiosks — the branch backfill cannot help them and
    // they otherwise become unrecognizable on every kiosk.
    expect(empSql).toContain('e.branch_id IS NULL AND fe.branch_id IS NULL');
  });

  it('scopes contractor kiosk roster by current or stored enrollment branch', async () => {
    const { service, dataSource } = makeService({
      employeeRows: [],
      contractorRows: [
        {
          contractorEmployeeId: 'contractor-1',
          name: 'Contractor One',
          embedding: embeddingBuffer,
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
    });

    const roster = await service.getRoster(device);

    expect(roster).toHaveLength(1);
    expect(roster[0]).toEqual(
      expect.objectContaining({
        subjectType: 'CONTRACTOR',
        subjectId: 'contractor-1',
        displayName: 'Contractor One',
      }),
    );
    const conSql = dataSource.query.mock.calls[1][0] as string;
    expect(conSql).toContain('ce.branch_id = $2 OR cfe.branch_id = $2');
    expect(conSql).toContain('ce.branch_id IS NULL AND cfe.branch_id IS NULL');
  });

  it('holds borderline single-gallery matches for review instead of auto-accepting', async () => {
    const { service, punchRepo, biometricService } = makeService({
      employeeRows: [
        {
          employeeId: 'employee-1',
          name: 'Test',
          employeeCode: 'E001',
          embedding: makeEmbeddingBufferForCosine(0.8),
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
    });

    const result = await service.recordPunch(device, dto);

    expect(result).toEqual(expect.objectContaining({ ok: true, review: true }));
    // Punch is recorded for the audit trail but NOT mirrored to attendance.
    expect(punchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'REVIEW_PENDING' }),
    );
    expect(biometricService.ingest).not.toHaveBeenCalled();
  });

  it('holds borderline multi-gallery matches for review instead of auto-accepting', async () => {
    const { service, punchRepo, biometricService } = makeService({
      employeeRows: [
        {
          employeeId: 'employee-1',
          name: 'Test',
          employeeCode: 'E001',
          embedding: makeEmbeddingBufferForCosine(0.83),
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
        {
          employeeId: 'employee-2',
          name: 'Second',
          employeeCode: 'E002',
          embedding: makeEmbeddingBufferForCosine(0.74),
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
    });

    const result = await service.recordPunch(device, dto);

    expect(result).toEqual(expect.objectContaining({ ok: true, review: true }));
    expect(punchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'REVIEW_PENDING' }),
    );
    expect(biometricService.ingest).not.toHaveBeenCalled();
  });

  it('hard-rejects matches below the review band without recording anything', async () => {
    const { service, punchRepo, biometricService, dataSource } = makeService({
      employeeRows: [
        {
          employeeId: 'employee-1',
          name: 'Test',
          employeeCode: 'E001',
          embedding: makeEmbeddingBufferForCosine(0.65),
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
    });

    await expect(service.recordPunch(device, dto)).rejects.toThrow(
      'No face match above threshold',
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(punchRepo.save).not.toHaveBeenCalled();
    expect(biometricService.ingest).not.toHaveBeenCalled();
  });

  it('groups multiple templates per subject so own templates never eat the margin', async () => {
    const { service, biometricService } = makeService({
      employeeRows: [
        {
          employeeId: 'employee-1',
          name: 'Test',
          employeeCode: 'E001',
          embedding: makeEmbeddingBufferForCosine(0.95),
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
        {
          // second template of the SAME employee, close behind — must not
          // trigger the ambiguous-margin path
          employeeId: 'employee-1',
          name: 'Test',
          employeeCode: 'E001',
          embedding: makeEmbeddingBufferForCosine(0.93),
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
        {
          employeeId: 'employee-2',
          name: 'Other',
          employeeCode: 'E002',
          embedding: makeEmbeddingBufferForCosine(0.6),
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
    });

    const result = await service.recordPunch(device, dto);

    expect(result).toEqual(
      expect.objectContaining({ ok: true, employeeCode: 'E001' }),
    );
    expect(biometricService.ingest).toHaveBeenCalledTimes(1);
  });

  it('treats model aliases as compatible (kiosk "mobilefacenet" vs face-svc "mobilefacenet-v1")', async () => {
    const { service, biometricService } = makeService({
      employeeRows: [
        {
          employeeId: 'employee-1',
          name: 'Test',
          employeeCode: 'E001',
          embedding: makeEmbeddingBufferForCosine(0.95),
          embeddingModel: 'mobilefacenet-v1',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
    });

    const result = await service.recordPunch(device, dto);

    expect(result).toEqual(
      expect.objectContaining({ ok: true, employeeCode: 'E001' }),
    );
    expect(biometricService.ingest).toHaveBeenCalledTimes(1);
  });

  it('excludes roster entries from a different embedding model', async () => {
    const { service } = makeService({
      employeeRows: [
        {
          employeeId: 'employee-1',
          name: 'Test',
          employeeCode: 'E001',
          embedding: makeEmbeddingBufferForCosine(0.99),
          embeddingModel: 'arcface-buffalo_l-v1',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
    });

    // Probe declares mobilefacenet; the only gallery entry is ArcFace →
    // nothing comparable, and the punch must be refused, not mismatched.
    await expect(service.recordPunch(device, dto)).rejects.toThrow(
      'No eligible enrollments on this device',
    );
  });

  it('records the second employee face punch as OUT even when an old APK sends IN', async () => {
    const previousPunch = {
      punch_time: new Date('2026-07-04T02:00:00.000Z'),
      direction: 'IN',
    };
    const { service, punchRepo, biometricService } = makeService({
      employeeRows: [
        {
          employeeId: 'employee-1',
          name: 'Employee One',
          employeeCode: 'E001',
          embedding: embeddingBuffer,
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
      cooldownRows: [previousPunch],
      todayRows: [previousPunch],
    });

    const resp = await service.recordPunch(device, dto);

    expect(resp.direction).toBe('OUT');
    expect(punchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'OUT' }),
    );
    expect(biometricService.ingest).toHaveBeenCalledWith(
      'client-1',
      [
        expect.objectContaining({
          direction: 'OUT',
          employeeCode: 'E001',
        }),
      ],
      true,
      expect.anything(),
    );
  });

  it('records employee face punch as OUT after a biometric device IN on the same day', async () => {
    const biometricIn = {
      punch_time: new Date('2026-07-04T02:00:00.000Z'),
      direction: 'IN',
    };
    const { service, punchRepo, biometricService, dataSource } = makeService({
      employeeRows: [
        {
          employeeId: 'employee-1',
          name: 'Employee One',
          employeeCode: 'E001',
          embedding: embeddingBuffer,
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
      cooldownRows: [],
      todayRows: [biometricIn],
    });

    const resp = await service.recordPunch(device, dto);

    // calls: 0=employee roster, 1=contractor roster, 2=client thresholds,
    // 3=cooldown, 4=direction resolution
    const directionSql = dataSource.query.mock.calls[4][0] as string;
    expect(directionSql).toContain('biometric_punches');
    // Mirrored mobile punches must NOT be double-counted as day punches —
    // that made one check-in look like a completed day and blocked check-out.
    expect(directionSql).toContain(`NOT IN ('MOBILE_KIOSK','MOBILE_ESS')`);
    expect(resp.direction).toBe('OUT');
    expect(punchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'OUT' }),
    );
    expect(biometricService.ingest).toHaveBeenCalledWith(
      'client-1',
      [
        expect.objectContaining({
          direction: 'OUT',
          employeeCode: 'E001',
        }),
      ],
      true,
      expect.anything(),
    );
  });

  it('rejects another employee face punch after IN and OUT are already recorded for the day', async () => {
    const { service, punchRepo, biometricService } = makeService({
      employeeRows: [
        {
          employeeId: 'employee-1',
          name: 'Employee One',
          employeeCode: 'E001',
          embedding: embeddingBuffer,
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
      cooldownRows: [{ punch_time: new Date('2026-07-04T02:00:00.000Z') }],
      todayRows: [
        { punch_time: new Date('2026-07-04T01:00:00.000Z'), direction: 'IN' },
        { punch_time: new Date('2026-07-04T02:00:00.000Z'), direction: 'OUT' },
      ],
    });

    await expect(service.recordPunch(device, dto)).rejects.toThrow(
      'Attendance already completed for today',
    );
    expect(punchRepo.save).not.toHaveBeenCalled();
    expect(biometricService.ingest).not.toHaveBeenCalled();
  });

  it('keeps contractor face punches out of the employee daily attendance pipeline', async () => {
    const { service, biometricService } = makeService({
      contractorRows: [
        {
          contractorEmployeeId: 'contractor-1',
          name: 'Contractor One',
          embedding: embeddingBuffer,
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
    });

    await service.recordPunch(device, dto);

    expect(biometricService.ingest).not.toHaveBeenCalled();
  });
});
