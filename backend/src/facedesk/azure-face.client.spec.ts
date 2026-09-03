import { AzureFaceClient } from './azure-face.client';
import { FaceDeskAzureFaceService } from './facedesk-azure-face.service';

/**
 * AZURE_FACE_IDENTIFICATION is an explicit deployment opt-in even though
 * Microsoft Identification is approved on statcompy-face (re-probed 2026-09-03:
 * findsimilars returns 400 on bad input, not 403 UnsupportedFeature).
 */
describe('AzureFaceClient — feature gating', () => {
  const ENV = process.env;

  beforeEach(() => {
    process.env = { ...ENV };
    delete process.env.AZURE_FACE_ENDPOINT;
    delete process.env.AZURE_FACE_KEY;
    delete process.env.AZURE_FACE_IDENTIFICATION;
  });

  afterAll(() => {
    process.env = ENV;
  });

  const withCreds = () => {
    process.env.AZURE_FACE_ENDPOINT =
      'https://statcompy-face.cognitiveservices.azure.com';
    process.env.AZURE_FACE_KEY = 'test-key';
  };

  it('is not configured without both endpoint and key', () => {
    expect(new AzureFaceClient().configured).toBe(false);

    process.env.AZURE_FACE_ENDPOINT =
      'https://example.cognitiveservices.azure.com';
    expect(new AzureFaceClient().configured).toBe(false);
  });

  it('is configured once endpoint and key are both set', () => {
    withCreds();
    expect(new AzureFaceClient().configured).toBe(true);
  });

  it('leaves identification off when only credentials are set', () => {
    withCreds();
    // The liveness case: credentials present so sessions can be created, but
    // findsimilars is still denied by Microsoft.
    expect(new AzureFaceClient().identificationEnabled).toBe(false);
  });

  it('enables identification only on explicit opt-in', () => {
    withCreds();
    process.env.AZURE_FACE_IDENTIFICATION = 'true';
    expect(new AzureFaceClient().identificationEnabled).toBe(true);
  });

  it('does not enable identification without credentials, even if opted in', () => {
    process.env.AZURE_FACE_IDENTIFICATION = 'true';
    expect(new AzureFaceClient().identificationEnabled).toBe(false);
  });
});

describe('FaceDeskAzureFaceService — duplicate path gating', () => {
  const ENV = process.env;

  beforeEach(() => {
    process.env = { ...ENV };
    process.env.AZURE_FACE_ENDPOINT =
      'https://statcompy-face.cognitiveservices.azure.com';
    process.env.AZURE_FACE_KEY = 'test-key';
    delete process.env.AZURE_FACE_IDENTIFICATION;
  });

  afterAll(() => {
    process.env = ENV;
  });

  const makeService = () =>
    new FaceDeskAzureFaceService(new AzureFaceClient(), {} as any, {} as any);

  it('stays off when credentials are set for liveness but identification is not approved', () => {
    // Enabling Azure for liveness must not start the duplicate path.
    expect(makeService().enabled).toBe(false);
  });

  it('turns on once identification is opted in', () => {
    process.env.AZURE_FACE_IDENTIFICATION = 'true';
    expect(makeService().enabled).toBe(true);
  });
});

/**
 * The counterpart to the duplicate-path gating above. Liveness and 1:N are
 * granted independently by Microsoft, so the flags must move independently:
 * requiring AZURE_FACE_IDENTIFICATION for liveness would switch off a feature
 * this resource HAS because of one it may not have.
 */
describe('FaceDeskAzureFaceService — liveness gating is independent of 1:N', () => {
  const ENV = process.env;

  beforeEach(() => {
    process.env = { ...ENV };
    delete process.env.AZURE_FACE_ENDPOINT;
    delete process.env.AZURE_FACE_KEY;
    delete process.env.AZURE_FACE_IDENTIFICATION;
  });

  afterAll(() => {
    process.env = ENV;
  });

  const makeService = () =>
    new FaceDeskAzureFaceService(new AzureFaceClient(), {} as any, {} as any);

  const withCreds = () => {
    process.env.AZURE_FACE_ENDPOINT =
      'https://statcompy-face.cognitiveservices.azure.com';
    process.env.AZURE_FACE_KEY = 'test-key';
  };

  it('is on with credentials alone, without identification approval', () => {
    withCreds();
    const svc = makeService();
    expect(svc.livenessEnabled).toBe(true);
    // ...while the duplicate path stays off. The two must not move together.
    expect(svc.enabled).toBe(false);
  });

  it('is off without credentials', () => {
    expect(makeService().livenessEnabled).toBe(false);
  });

  it('refuses to create a session when Azure is not configured', async () => {
    await expect(
      makeService().createDeviceLivenessSession('dev-1'),
    ).rejects.toThrow(/not configured/i);
  });

  it('returns null rather than throwing when a verdict cannot be read', async () => {
    // A network blip on the result lookup must let the punch path fall back,
    // not fail closed on a verdict it could not fetch.
    const flaky = {
      configured: true,
      getLivenessSessionResult: jest
        .fn()
        .mockRejectedValue(new Error('socket hang up')),
    };
    const svc = new FaceDeskAzureFaceService(
      flaky as any,
      {} as any,
      {} as any,
    );
    await expect(svc.readLivenessVerdict('sess-1')).resolves.toBeNull();
    expect(flaky.getLivenessSessionResult).toHaveBeenCalledWith('sess-1');
  });
});

/**
 * Regression guard for a bug that was invisible in production.
 *
 * Node's fetch sends NO Content-Type for a Uint8Array body. Azure then tries to
 * parse the image as JSON and returns 400 BadArgument "JSON parsing error" —
 * naming neither the header nor the image. Because every Azure path falls back
 * to cosine on failure, enrolment registration and duplicate detection both
 * failed silently for as long as the header was missing; only the backfill,
 * which reports per-profile errors, surfaced it.
 */
describe('AzureFaceClient — image uploads must declare octet-stream', () => {
  const ENV = process.env;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env = { ...ENV };
    process.env.AZURE_FACE_ENDPOINT =
      'https://statcompy-face.cognitiveservices.azure.com';
    process.env.AZURE_FACE_KEY = 'test-key';
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ persistedFaceId: 'pf-1' }),
    });
    (global as any).fetch = fetchMock;
  });

  afterAll(() => {
    process.env = ENV;
  });

  const contentTypeOf = () =>
    (fetchMock.mock.calls[0][1].headers as Record<string, string>)[
      'Content-Type'
    ];

  it('sets octet-stream on addPersistedFace', async () => {
    await new AzureFaceClient().addPersistedFace(
      'list-1',
      Buffer.from('jpeg-bytes'),
      'emp-1',
    );
    expect(contentTypeOf()).toBe('application/octet-stream');
  });

  it('sets octet-stream on detectFace', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    await new AzureFaceClient().detectFace(Buffer.from('jpeg-bytes'));
    expect(contentTypeOf()).toBe('application/octet-stream');
  });

  it('still sends JSON content type on the JSON calls', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    await new AzureFaceClient().findSimilar('list-1', 'face-1', 0.7);
    expect(contentTypeOf()).toBe('application/json');
  });
});

/**
 * The 1:N identification gates. The margin check is the one that matters: in a
 * crowded gallery a high score alone is not an identification if the runner-up
 * is almost as high — that is an ambiguous face, and the only safe answer is no.
 */
describe('FaceDeskAzureFaceService.identifyForAttendance', () => {
  const ENV = process.env;

  beforeEach(() => {
    process.env = { ...ENV };
    process.env.AZURE_FACE_ENDPOINT =
      'https://statcompy-face.cognitiveservices.azure.com';
    process.env.AZURE_FACE_KEY = 'test-key';
    process.env.AZURE_FACE_IDENTIFICATION = 'true';
  });

  afterAll(() => {
    process.env = ENV;
  });

  const make = (matches: Array<{ persistedFaceId: string; confidence: number }>) => {
    const azure = {
      identificationEnabled: true,
      configured: true,
      detectFace: jest.fn().mockResolvedValue({ faceId: 'f1' }),
      findSimilar: jest.fn().mockResolvedValue(matches),
    };
    const profileRepo = {
      findOne: jest.fn().mockResolvedValue({
        employeeId: 'e1',
        enrollmentStatus: 'ENROLLED',
      }),
    };
    return {
      svc: new FaceDeskAzureFaceService(
        azure as any,
        {} as any,
        profileRepo as any,
      ),
      profileRepo,
    };
  };

  it('identifies a clear top match', async () => {
    const { svc } = make([
      { persistedFaceId: 'p1', confidence: 0.93 },
      { persistedFaceId: 'p2', confidence: 0.61 },
    ]);
    await expect(svc.identifyForAttendance('c1', 'img')).resolves.toMatchObject({
      employeeId: 'e1',
      confidence: 0.93,
    });
  });

  it('refuses when the runner-up is too close to call', async () => {
    // Both well above the confidence floor, but only 0.01 apart. Picking one
    // would be a coin flip that marks somebody present.
    const { svc } = make([
      { persistedFaceId: 'p1', confidence: 0.9 },
      { persistedFaceId: 'p2', confidence: 0.89 },
    ]);
    await expect(svc.identifyForAttendance('c1', 'img')).resolves.toBeNull();
  });

  it('refuses a top match below the confidence floor', async () => {
    const { svc } = make([{ persistedFaceId: 'p1', confidence: 0.4 }]);
    await expect(svc.identifyForAttendance('c1', 'img')).resolves.toBeNull();
  });

  it('refuses when the matched face has no enrolled profile', async () => {
    const { svc, profileRepo } = make([
      { persistedFaceId: 'orphan', confidence: 0.95 },
    ]);
    profileRepo.findOne.mockResolvedValue(null);
    await expect(svc.identifyForAttendance('c1', 'img')).resolves.toBeNull();
  });

  it('refuses when the profile is no longer ENROLLED', async () => {
    const { svc, profileRepo } = make([
      { persistedFaceId: 'p1', confidence: 0.95 },
    ]);
    profileRepo.findOne.mockResolvedValue({
      employeeId: 'e1',
      enrollmentStatus: 'BLOCKED',
    });
    await expect(svc.identifyForAttendance('c1', 'img')).resolves.toBeNull();
  });
});
