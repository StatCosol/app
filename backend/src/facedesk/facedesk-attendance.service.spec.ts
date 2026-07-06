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

describe('FaceDeskAttendanceService.markAttendance', () => {
  it('MARKS a confident match and resolves IN on the first punch', async () => {
    const { service, attRepo } = makeService(roster(0.95), 0);
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
    } as any);
    expect(res.status).toBe('MARKED');
    expect(res.punchType).toBe('IN');
    expect(attRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ attendanceStatus: 'MARKED', employeeId: 'e1' }),
    );
  });

  it('resolves OUT when one counted punch already exists today', async () => {
    const { service } = makeService(roster(0.95), 1);
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
    } as any);
    expect(res.punchType).toBe('OUT');
  });

  it('asks to RETRY in the 90–95% band', async () => {
    const { service, attRepo } = makeService(roster(0.8), 0); // between retry 0.78 and accept 0.84
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
    } as any);
    expect(res.status).toBe('RETRY');
    expect(attRepo.save).not.toHaveBeenCalled();
  });

  it('REJECTS and logs a failed attempt below the retry band', async () => {
    const { service, failRepo } = makeService(roster(0.6), 0);
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
    } as any);
    expect(res.status).toBe('REJECTED');
    expect(failRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'NO_MATCH' }),
    );
  });

  it('sends ambiguous multi-matches to REVIEW', async () => {
    const { service, reviewRepo } = makeService(
      roster(0.9, [{ id: 'e2', code: 'E002', cos: 0.88 }]), // margin 0.02 < 0.05
      0,
    );
    const res = await service.markAttendance('c1', 'b1', 'd1', {
      frames: [probeFrame()],
    } as any);
    expect(res.status).toBe('REVIEW');
    expect(reviewRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ issueType: 'MULTIPLE_MATCH' }),
    );
  });
});
