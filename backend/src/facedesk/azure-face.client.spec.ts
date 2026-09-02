import { AzureFaceClient } from './azure-face.client';
import { FaceDeskAzureFaceService } from './facedesk-azure-face.service';

/**
 * Microsoft grants Face Limited Access per feature, and this resource has
 * Verification/Liveness but not Identification (probed 2026-08-31: liveness
 * sessions 200, findsimilars 403 "missing approval for: Identification").
 *
 * These pin the consequence: credentials must not, on their own, switch on the
 * duplicate-detection path — that would 403 on every enrolment and fall back to
 * cosine, adding a failed round-trip to each one.
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
