import * as bcrypt from 'bcryptjs';
import { FaceDeskAttendanceService } from './facedesk-attendance.service';

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
  const dataSource = {
    query: jest
      .fn()
      // loadRoster
      .mockResolvedValueOnce(rosterRows)
      // nextPunchType count
      .mockResolvedValueOnce([{ n: String(todayCount) }]),
  };
  const service = new FaceDeskAttendanceService(
    attRepo as any,
    failRepo as any,
    reviewRepo as any,
    faceService as any,
    settings as any,
    photo as any,
    dataSource as any,
  );
  return { service, attRepo, failRepo, reviewRepo };
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
    // Re-wire dataSource: 1st query = loadClaimedProfile, 2nd = nextPunchType.
    (base.service as any).dataSource.query = jest
      .fn()
      .mockResolvedValueOnce(claimedRows ?? [])
      .mockResolvedValueOnce([{ n: String(todayCount) }]);
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

  it('MARKS but flags for branch verification when PIN is right and face mismatches', async () => {
    const { service, attRepo, reviewRepo } = makePinService(
      await claimedProfile(0.6),
    );
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      employeeCode: 'E001',
      pin: '1234',
    } as any);
    // Counts immediately (reversible) …
    expect(res.status).toBe('MARKED');
    expect(res.message).toMatch(/verification/i);
    expect(attRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ attendanceStatus: 'MARKED', employeeId: 'e1' }),
    );
    // … but a FACE_MISMATCH review item is queued for the branch.
    expect(reviewRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        issueType: 'FACE_MISMATCH',
        status: 'PENDING',
        attendanceId: 'att-1',
      }),
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
    rows: Array<{ id: string; code: string; cos: number; pin?: string }>,
  ) =>
    Promise.all(
      rows.map(async (r) => ({
        employeeId: r.id,
        employeeCode: r.code,
        name: r.code,
        branchId: 'b1',
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
    const { service, attRepo, failRepo } = makeService([]);
    // PIN-only resolution first tries the indexed lookup, then falls back to a
    // roster scan — both empty here, so force both queries to return [].
    (service as any).dataSource.query = jest.fn().mockResolvedValue([]);
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
      pin: '1234',
    } as any);
    expect(res.status).toBe('REJECTED');
    expect(res.message).toMatch(/no enrolled employees/i);
    expect(failRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'NO_ENROLLED' }),
    );
    expect(attRepo.save).not.toHaveBeenCalled();
  });
});
