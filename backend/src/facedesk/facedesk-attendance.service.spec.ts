import * as bcrypt from 'bcryptjs';
import { FaceDeskAttendanceService } from './facedesk-attendance.service';
import { FaceDeskFailedAttemptService } from './facedesk-failed-attempt.service';
import { FaceDeskPinAttendanceService } from './facedesk-pin-attendance.service';
import { FaceDeskPunchAcceptService } from './facedesk-punch-accept.service';
import { FaceDeskPunchDirectionService } from './facedesk-punch-direction.service';

// Cosine helpers: build unit vectors whose pairwise cosine == target.
const vecForCosine = (cos: number) =>
  new Float32Array([cos, Math.sqrt(Math.max(0, 1 - cos * cos)), 0, 0]);
const toBuf = (v: Float32Array) => Buffer.from(v.buffer);
const probeFrame = () => ({
  embeddingB64: Buffer.from(new Float32Array([1, 0, 0, 0]).buffer).toString(
    'base64',
  ),
  embeddingModel: 'mobilefacenet',
  qualityScore: 1,
});

/** Effective settings matching the module defaults (95%→0.84, 90%→0.78). */
const effective = {
  acceptCosine: 0.84,
  retryCosine: 0.78,
  duplicateCosine: 0.78,
  minMarginCosine: 0.05,
  livenessRequired: false,
  minFaceSamples: 5,
  frameCaptureCount: 15,
  matchConfidencePct: 95,
  retryConfidencePct: 90,
  duplicatePct: 90,
  offlineSyncEnabled: true,
};

function makeService(rosterRows: any[], todayCount = 0) {
  const attRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (r: any) => ({
      ...r,
      attendanceId: 'att-1',
      punchTime: r.punchTime,
    })),
    createQueryBuilder: jest.fn(),
  };
  const failRepo = {
    save: jest.fn(async (r: any) => ({ ...r, attemptId: 'fail-1' })),
  };
  const reviewRepo = {
    save: jest.fn(async (r: any) => ({ ...r, reviewId: 'rev-1' })),
  };
  const contractorPunchRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (r: any) => ({ ...r, id: 'cpunch-1' })),
  };
  const faceService = {
    resolveFrames: jest.fn(async (frames: any[]) =>
      frames.map(() => ({
        embedding: new Float32Array([1, 0, 0, 0]),
        model: 'mobilefacenet',
        qualityScore: 1,
        livenessScore: null,
        sampleType: 'FRONT',
        reasons: [],
      })),
    ),
    goodFrames: (fr: any[]) => fr,
    // Mirrors the real grouping: keep only frames comparable with the first.
    selectComparableFrames: (fr: any[]) =>
      fr.filter((f) => f.embedding?.length === fr[0]?.embedding?.length),
    bestFrames: (fr: any[], n: number) => fr.slice(0, n),
    cosine: (a: Float32Array, b: Float32Array) => {
      let dot = 0,
        na = 0,
        nb = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
    },
    simpleQualityMessage: () => 'Face not clear',
  };
  const settings = {
    getEffective: jest.fn(async () => effective),
    cosineToPercent: (c: number) => Math.round(c * 100),
  };
  const photo = {
    uploadPhoto: jest.fn(async () => '/uploads/face-photos/x.jpg'),
  };
  // SQL-aware so the number of gallery lookups (one per PIN-matched candidate)
  // doesn't have to be counted: samples → [], punch-count → n, else → roster.
  const dataSource = {
    query: jest.fn((sql: string) => {
      if (/facedesk_employee_face_samples/i.test(sql))
        return Promise.resolve([]);
      if (/count\(\*\)/i.test(sql))
        return Promise.resolve([{ n: String(todayCount) }]);
      return Promise.resolve(rosterRows);
    }),
  };
  // Default liveness provider mirrors DeviceLivenessProvider: trust the client
  // blink flag OR a server-scored frame ≥ 0.5.
  const liveness = {
    name: 'device',
    evaluate: jest.fn(async (input: any) => {
      const best = Math.max(
        -1,
        ...input.serverScores.map((s: number | null) => s ?? -1),
      );
      return {
        passed: input.clientAsserted || best >= 0.5,
        score: best >= 0 ? best : null,
        provider: 'device',
      };
    }),
  };
  const biometric = {
    ingest: jest.fn().mockResolvedValue({ received: 1, inserted: 1 }),
  };
  const failedAttemptService = new FaceDeskFailedAttemptService(
    failRepo as any,
    dataSource as any,
  );
  const directionService = new FaceDeskPunchDirectionService(dataSource as any);
  /** Serves only the advisory lock/unlock the punch path wraps itself in. */
  const lockingDataSource = {
    createQueryRunner: () => ({
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      release: jest.fn().mockResolvedValue(undefined),
    }),
  };
  const punchAcceptService = new FaceDeskPunchAcceptService(
    attRepo as any,
    reviewRepo as any,
    contractorPunchRepo as any,
    photo as any,
    biometric as any,
    directionService,
    failedAttemptService,
    // acceptPunch takes a per-subject advisory lock around the gap check and the
    // insert, so it needs a DataSource it can get a QueryRunner from. The runner
    // only ever runs pg_advisory_lock/unlock here; the punch itself still goes
    // through the repositories above.
    lockingDataSource as any,
  );
  const pinAttendanceService = new FaceDeskPinAttendanceService(
    dataSource as any,
    faceService as any,
    settings as any,
    failedAttemptService,
    punchAcceptService,
  );
  const faceOnlyAttendanceService = {
    markByFace: jest
      .fn()
      .mockResolvedValue({ status: 'MARKED', message: 'ok' }),
  };
  const service = new FaceDeskAttendanceService(
    attRepo as any,
    contractorPunchRepo as any,
    faceService as any,
    settings as any,
    liveness as any,
    { offlineSync: jest.fn() } as any,
    failedAttemptService,
    pinAttendanceService,
    faceOnlyAttendanceService as any,
    punchAcceptService,
    directionService,
  );
  return {
    service,
    faceOnlyAttendanceService,
    attRepo,
    failRepo,
    reviewRepo,
    contractorPunchRepo,
    biometric,
    dataSource,
    photo,
  };
}

const roster = (
  cos: number,
  extra: Array<{ id: string; code: string; cos: number }> = [],
) => [
  {
    employeeId: 'e1',
    employeeCode: 'E001',
    name: 'One',
    branchId: 'b1',
    template: toBuf(vecForCosine(cos)),
    model: 'mobilefacenet',
  },
  ...extra.map((x) => ({
    employeeId: x.id,
    employeeCode: x.code,
    name: x.code,
    branchId: 'b1',
    template: toBuf(vecForCosine(x.cos)),
    model: 'mobilefacenet',
  })),
];

describe('FaceDeskAttendanceService offline sync — no face-only bypass', () => {
  it('REJECTS a credential-less offline punch (PIN mandatory, legacy 1:N path removed)', async () => {
    const { service, attRepo, failRepo } = makeService(roster(0.95), 0);
    const res = await service.markAttendance(
      'c1',
      'b1',
      'd1',
      { frames: [probeFrame()] } as any, // no employeeCode / pin
    );
    expect(res.status).toBe('REJECTED');
    expect(failRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'PIN_MISSING' }),
    );
    expect(attRepo.save).not.toHaveBeenCalled();
  });
});

describe('FaceDeskAttendanceService.markAttendance — PIN_THEN_FACE', () => {
  const claimedProfile = async (faceCos: number, pin = '1234') => [
    {
      employeeId: 'e1',
      employeeCode: 'E001',
      name: 'One',
      branchId: 'b1',
      template: toBuf(vecForCosine(faceCos)),
      model: 'mobilefacenet',
      pinHash: await bcrypt.hash(pin, 4),
    },
  ];

  const makePinService = (claimedRows: any[] | null, todayCount = 0) => {
    const base = makeService([], todayCount);
    base.dataSource.query = jest.fn((sql: string) => {
      if (/facedesk_employee_face_samples/i.test(sql))
        return Promise.resolve([]);
      if (/count\(\*\)/i.test(sql))
        return Promise.resolve([{ n: String(todayCount) }]);
      return Promise.resolve(claimedRows ?? []);
    });
    return base;
  };

  it('MARKS when code + PIN + face all match (1:1)', async () => {
    const { service, attRepo } = makePinService(await claimedProfile(0.95));
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      employeeCode: 'E001',
      pin: '1234',
    } as any);
    expect(res.status).toBe('MARKED');
    expect(res.employeeCode).toBe('E001');
    expect(attRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'e1', attendanceStatus: 'MARKED' }),
    );
  });

  it('REJECTS a wrong PIN and never marks', async () => {
    const { service, attRepo, failRepo } = makePinService(
      await claimedProfile(0.95),
    );
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      employeeCode: 'E001',
      pin: '9999',
    } as any);
    expect(res.status).toBe('REJECTED');
    expect(res.message).toMatch(/Incorrect PIN/i);
    expect(failRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'WRONG_PIN' }),
    );
    expect(attRepo.save).not.toHaveBeenCalled();
  });

  it('does NOT record a punch when PIN is right but the face does not match — asks retry', async () => {
    // Hard face gate: a below-accept match records NO attendance and no review
    // item; the worker is asked to retry and a failed attempt is logged.
    const { service, attRepo, reviewRepo, failRepo } = makePinService(
      await claimedProfile(0.6),
    );
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      employeeCode: 'E001',
      pin: '1234',
    } as any);
    expect(res.status).toBe('RETRY');
    expect(res.message).toMatch(/not recognized/i);
    expect(attRepo.save).not.toHaveBeenCalled();
    expect(reviewRepo.save).not.toHaveBeenCalled();
    expect(failRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'NO_MATCH' }),
    );
  });

  it('asks retry on borderline confidence instead of recording a punch', async () => {
    const { service, attRepo, reviewRepo, failRepo } = makePinService(
      await claimedProfile(0.8), // between retry (0.78) and accept (0.84)
    );
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      employeeCode: 'E001',
      pin: '1234',
    } as any);
    expect(res.status).toBe('RETRY');
    expect(attRepo.save).not.toHaveBeenCalled();
    expect(reviewRepo.save).not.toHaveBeenCalled();
    expect(failRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'LOW_CONFIDENCE' }),
    );
  });

  it('REJECTS when code or PIN is missing', async () => {
    const { service, failRepo } = makePinService(await claimedProfile(0.95));
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
    } as any);
    expect(res.status).toBe('REJECTED');
    expect(failRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'PIN_MISSING' }),
    );
  });

  it('REJECTS an unknown employee code', async () => {
    const { service } = makePinService([]);
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      employeeCode: 'NOPE',
      pin: '1234',
    } as any);
    expect(res.status).toBe('REJECTED');
    expect(res.message).toMatch(/not recognized/i);
  });

  it('REJECTS a credential-less offline punch — no face-only bypass via offline sync', async () => {
    // A face-only APK (or a direct offline-sync submission) can no longer omit
    // the PIN to fall through to a 1:N match; PIN is required for every punch.
    const { service, attRepo, failRepo } = makeService(roster(0.95), 0);
    const res = await service.markAttendance(
      'c1',
      'b1',
      'd1',
      { frames: [probeFrame()] } as any, // no code/pin
    );
    expect(res.status).toBe('REJECTED');
    expect(failRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'PIN_MISSING' }),
    );
    expect(attRepo.save).not.toHaveBeenCalled();
  });
});

describe('FaceDeskAttendanceService.markAttendance — PIN-only (no employee code)', () => {
  const pinRoster = (
    rows: Array<{
      id: string;
      code: string;
      cos: number;
      pin?: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
    }>,
  ) =>
    Promise.all(
      rows.map(async (r) => ({
        employeeId: r.id,
        employeeCode: r.code,
        name: r.code,
        branchId: 'b1',
        subjectType: r.subjectType ?? 'EMPLOYEE',
        template: toBuf(vecForCosine(r.cos)),
        model: 'mobilefacenet',
        pinHash: await bcrypt.hash(r.pin ?? '1234', 4),
      })),
    );

  it('MARKS on PIN + face alone — worker never types a code', async () => {
    const { service, attRepo } = makeService(
      await pinRoster([{ id: 'e1', code: 'E001', cos: 0.95, pin: '1234' }]),
    );
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
    } as any);
    expect(res.status).toBe('MARKED');
    expect(res.employeeCode).toBe('E001');
    expect(attRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'e1', attendanceStatus: 'MARKED' }),
    );
  });

  it('REJECTS a wrong PIN with no code and never marks', async () => {
    const { service, attRepo, failRepo } = makeService(
      await pinRoster([{ id: 'e1', code: 'E001', cos: 0.95, pin: '1234' }]),
    );
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '9999',
    } as any);
    expect(res.status).toBe('REJECTED');
    expect(res.message).toMatch(/Incorrect PIN/i);
    expect(failRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'WRONG_PIN' }),
    );
    expect(attRepo.save).not.toHaveBeenCalled();
  });

  it('lets the face break a PIN collision (two employees share a PIN)', async () => {
    const { service, attRepo } = makeService(
      await pinRoster([
        { id: 'e1', code: 'E001', cos: 0.95, pin: '1234' },
        { id: 'e2', code: 'E002', cos: 0.5, pin: '1234' },
      ]),
    );
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
    } as any);
    expect(res.status).toBe('MARKED');
    expect(res.employeeCode).toBe('E001');
    expect(attRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'e1' }),
    );
  });

  it('REJECTS PIN-only when the branch has no enrolled employees', async () => {
    const base = makeService([]);
    base.dataSource.query = jest.fn().mockResolvedValue([]);
    const res = await base.service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
    } as any);
    expect(res.status).toBe('REJECTED');
    expect(res.message).toMatch(/no enrolled employees/i);
    expect(base.failRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'NO_ENROLLED' }),
    );
    expect(base.attRepo.save).not.toHaveBeenCalled();
  });

  it('REJECTS once the device has burned through the PIN attempt limit', async () => {
    // todayCount feeds the WRONG_PIN count(*) — 6 recent failures ≥ the default
    // limit of 5, so the device is throttled before any roster/bcrypt work.
    const { service, attRepo, failRepo } = makeService([], 6);
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
    } as any);
    expect(res.status).toBe('REJECTED');
    expect(res.message).toMatch(/too many/i);
    // Lockout doesn't record a fresh failure (can't extend its own window) …
    expect(failRepo.save).not.toHaveBeenCalled();
    // … and never marks.
    expect(attRepo.save).not.toHaveBeenCalled();
  });

  it('does NOT write a guessed punch when two faces are near-tied (asks retry)', async () => {
    const { service, attRepo, contractorPunchRepo, reviewRepo, failRepo } =
      makeService(
        await pinRoster([
          { id: 'e1', code: 'E001', cos: 0.9, pin: '1234' },
          { id: 'e2', code: 'E002', cos: 0.88, pin: '1234' },
        ]),
      );
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
    } as any);
    // Both faces clear the accept bar but sit within the 0.05 margin. We can't
    // safely pick one (and a contractor review can't be reassigned), so ask for
    // another capture instead of recording attendance against a guess.
    expect(res.status).toBe('RETRY');
    expect(res.message).toMatch(/multiple close matches/i);
    expect(attRepo.save).not.toHaveBeenCalled();
    expect(contractorPunchRepo.save).not.toHaveBeenCalled();
    expect(reviewRepo.save).not.toHaveBeenCalled();
    expect(failRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'AMBIGUOUS_MATCH' }),
    );
  });

  it('passes only server-scored liveness to the provider, never the client score', async () => {
    const { service } = makeService(
      await pinRoster([{ id: 'e1', code: 'E001', cos: 0.95, pin: '1234' }]),
    );
    (service as any).settings.getEffective = jest.fn(async () => ({
      ...effective,
      livenessRequired: true,
    }));
    // A frame carrying a client-supplied livenessScore but NO server score.
    (service as any).faceService.resolveFrames = jest.fn(async () => [
      {
        embedding: new Float32Array([1, 0, 0, 0]),
        model: 'mobilefacenet',
        qualityScore: 1,
        livenessScore: 0.99, // client-supplied — must not be trusted as server
        serverLivenessScore: null,
        sampleType: 'FRONT',
        reasons: [],
      },
    ]);
    const evaluate = jest.fn(async () => ({
      passed: true,
      score: null,
      provider: 'device',
    }));
    (service as any).liveness = { name: 'device', evaluate };

    await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
      livenessPassed: true,
    } as any);

    // The strict gate must see the server score (null), never the client 0.99.
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ serverScores: [null] }),
    );
  });
});

describe('FaceDeskAttendanceService.markAttendance — contractor punch routing', () => {
  const pinRoster = (
    rows: Array<{
      id: string;
      code: string;
      cos: number;
      pin?: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
    }>,
  ) =>
    Promise.all(
      rows.map(async (r) => ({
        employeeId: r.id,
        employeeCode: r.code,
        name: r.code,
        branchId: 'b1',
        subjectType: r.subjectType ?? 'EMPLOYEE',
        template: toBuf(vecForCosine(r.cos)),
        model: 'mobilefacenet',
        pinHash: await bcrypt.hash(r.pin ?? '1234', 4),
      })),
    );

  it('routes a CONTRACTOR punch to the contractor pipeline, not employee logs', async () => {
    const base = makeService(
      await pinRoster([
        {
          id: 'c1e',
          code: 'C001',
          cos: 0.95,
          pin: '1234',
          subjectType: 'CONTRACTOR',
        },
      ]),
    );
    const { service, attRepo, contractorPunchRepo, dataSource } = base;
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
    } as any);
    expect(res.status).toBe('MARKED');
    // Contractor time goes to contractor_biometric_punches …
    expect(contractorPunchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contractorEmployeeId: 'c1e',
        clientId: 'c1',
        deviceId: 'd1',
        decision: 'AUTO',
      }),
    );
    // … and NEVER to the employee facedesk logs.
    expect(attRepo.save).not.toHaveBeenCalled();
    const directionSql = dataSource.query.mock.calls
      .map((c: any[]) => c[0] as string)
      .find((s: string) => /contractor_biometric_punches/i.test(s));
    expect(directionSql).toContain("'AUTO','REVIEW_APPROVED'");
    expect(directionSql).not.toContain("'AUTO','APPROVED'");
  });

  it('uses a stable device ID for authenticated non-device contractor punches', async () => {
    const { service, contractorPunchRepo } = makeService(
      await pinRoster([
        {
          id: 'c1e',
          code: 'C001',
          cos: 0.95,
          pin: '1234',
          subjectType: 'CONTRACTOR',
        },
      ]),
    );

    await service.markAttendance('c1', 'b1', null, {
      frames: [probeFrame()],
      pin: '1234',
    } as any);

    expect(contractorPunchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: '00000000-0000-0000-0000-000000000000',
      }),
    );
  });

  it('deduplicates a retried contractor offline punch by client and offlineRef', async () => {
    const { service, contractorPunchRepo } = makeService([]);
    contractorPunchRepo.findOne.mockResolvedValueOnce({
      id: 'existing-punch',
      clientId: 'c1',
      branchId: 'b1',
      contractorEmployeeId: 'c1e',
      direction: 'IN',
      punchTime: new Date('2026-07-25T03:30:00.000Z'),
      offlineRef: 'offline-1',
    });

    const result = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
      offlineRef: 'offline-1',
    } as any);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'MARKED',
        message: 'Attendance already recorded',
        punchType: 'IN',
      }),
    );
    expect(contractorPunchRepo.findOne).toHaveBeenCalledWith({
      where: { clientId: 'c1', offlineRef: 'offline-1' },
    });
    expect(contractorPunchRepo.save).not.toHaveBeenCalled();
  });

  it('persists the contractor offlineRef with the punch', async () => {
    const { service, contractorPunchRepo } = makeService(
      await pinRoster([
        {
          id: 'c1e',
          code: 'C001',
          cos: 0.95,
          pin: '1234',
          subjectType: 'CONTRACTOR',
        },
      ]),
    );

    await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
      offlineRef: 'offline-2',
    } as any);

    expect(contractorPunchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        offlineSync: true,
        offlineRef: 'offline-2',
      }),
    );
  });

  it('still routes an EMPLOYEE punch to the employee logs, not contractor', async () => {
    const { service, attRepo, contractorPunchRepo } = makeService(
      await pinRoster([{ id: 'e1', code: 'E001', cos: 0.95, pin: '1234' }]),
    );
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
    } as any);
    expect(res.status).toBe('MARKED');
    expect(attRepo.save).toHaveBeenCalled();
    expect(contractorPunchRepo.save).not.toHaveBeenCalled();
  });

  it('ingests a clean employee punch into the biometric pipeline (real-time daily attendance)', async () => {
    const { service, biometric } = makeService(
      await pinRoster([{ id: 'e1', code: 'E001', cos: 0.95, pin: '1234' }]),
    );
    await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
    } as any);
    expect(biometric.ingest).toHaveBeenCalledWith(
      'c1',
      [
        expect.objectContaining({
          employeeCode: 'E001',
          source: 'MOBILE_KIOSK',
        }),
      ],
      true,
    );
  });

  it('does NOT record or ingest anything on an employee face mismatch — asks retry', async () => {
    const { service, biometric, reviewRepo, failRepo } = makeService(
      await pinRoster([{ id: 'e1', code: 'E001', cos: 0.6, pin: '1234' }]),
    );
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
    } as any);
    expect(res.status).toBe('RETRY');
    expect(res.message).toMatch(/not recognized/i);
    expect(reviewRepo.save).not.toHaveBeenCalled();
    expect(biometric.ingest).not.toHaveBeenCalled();
    expect(failRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ bestEmployeeId: 'e1', reason: 'NO_MATCH' }),
    );
  });

  it('does NOT record a contractor punch on a face mismatch — asks retry', async () => {
    const { service, contractorPunchRepo, reviewRepo, failRepo } = makeService(
      await pinRoster([
        {
          id: 'c1e',
          code: 'C001',
          cos: 0.6,
          pin: '1234',
          subjectType: 'CONTRACTOR',
        },
      ]),
    );
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
    } as any);
    expect(res.status).toBe('RETRY');
    expect(contractorPunchRepo.save).not.toHaveBeenCalled();
    expect(reviewRepo.save).not.toHaveBeenCalled();
    expect(failRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ bestEmployeeId: 'c1e', reason: 'NO_MATCH' }),
    );
  });
});

describe('FaceDeskAttendanceService.markAttendance — adaptive gallery (point 4)', () => {
  const pinRow = async (cos: number, pin = '1234') => [
    {
      profileId: 'p1',
      employeeId: 'e1',
      employeeCode: 'E001',
      name: 'One',
      branchId: 'b1',
      subjectType: 'EMPLOYEE',
      template: toBuf(vecForCosine(cos)),
      model: 'mobilefacenet',
      pinHash: await bcrypt.hash(pin, 4),
    },
  ];

  it('MARKS cleanly on a gallery sample the enrollment template alone would flag', async () => {
    const rosterRows = await pinRow(0.5); // enrollment template is a weak match
    const base = makeService(rosterRows);
    base.dataSource.query = jest.fn((sql: string) => {
      if (/facedesk_employee_face_samples/i.test(sql))
        return Promise.resolve([{ embedding: toBuf(vecForCosine(0.95)) }]);
      if (/count\(\*\)/i.test(sql)) return Promise.resolve([{ n: '0' }]);
      return Promise.resolve(rosterRows);
    });
    const { service, attRepo, reviewRepo } = base;

    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
    } as any);

    // Template alone (0.5) would be held for review; the gallery sample (0.95)
    // clears it as a clean mark with no FACE_MISMATCH review raised.
    expect(res.status).toBe('MARKED');
    expect(res.message).not.toMatch(/verification/i);
    expect(reviewRepo.save).not.toHaveBeenCalled();
    expect(attRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'e1', attendanceStatus: 'MARKED' }),
    );
  });
});
