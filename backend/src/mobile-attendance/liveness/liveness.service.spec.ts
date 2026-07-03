import { BadRequestException } from '@nestjs/common';
import { LivenessService } from './liveness.service';

describe('LivenessService', () => {
  const originalEnv = process.env.FACE_LIVENESS_CHALLENGE_TYPES;
  const originalAdvancedEnv =
    process.env.FACE_ALLOW_ADVANCED_LIVENESS_CHALLENGES;

  const makeService = () => {
    const nonceRepo = {
      create: jest.fn((entity) => entity),
      save: jest.fn(async (entity) => entity),
    };
    const dataSource = { query: jest.fn() };
    const service = new LivenessService(nonceRepo as any, dataSource as any);
    return { service, nonceRepo };
  };

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.FACE_LIVENESS_CHALLENGE_TYPES;
    } else {
      process.env.FACE_LIVENESS_CHALLENGE_TYPES = originalEnv;
    }
    if (originalAdvancedEnv === undefined) {
      delete process.env.FACE_ALLOW_ADVANCED_LIVENESS_CHALLENGES;
    } else {
      process.env.FACE_ALLOW_ADVANCED_LIVENESS_CHALLENGES = originalAdvancedEnv;
    }
    jest.restoreAllMocks();
  });

  it('issues blink-only challenges by default for kiosk APK compatibility', async () => {
    delete process.env.FACE_LIVENESS_CHALLENGE_TYPES;
    const { service, nonceRepo } = makeService();

    const challenge = await service.issueChallenge('device-1');

    expect(challenge.challengeType).toBe('BLINK');
    expect(nonceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'device-1', challengeType: 'BLINK' }),
    );
  });

  it('allows an explicit challenge-type list for future app builds', async () => {
    process.env.FACE_ALLOW_ADVANCED_LIVENESS_CHALLENGES = 'true';
    process.env.FACE_LIVENESS_CHALLENGE_TYPES = 'SMILE';
    const { service } = makeService();

    const challenge = await service.issueChallenge('device-1');

    expect(challenge.challengeType).toBe('SMILE');
  });

  it('ignores advanced challenge env unless explicitly enabled', async () => {
    delete process.env.FACE_ALLOW_ADVANCED_LIVENESS_CHALLENGES;
    process.env.FACE_LIVENESS_CHALLENGE_TYPES = 'SMILE';
    const { service } = makeService();

    const challenge = await service.issueChallenge('device-1');

    expect(challenge.challengeType).toBe('BLINK');
  });

  it('ignores invalid env values and falls back to blink', async () => {
    process.env.FACE_ALLOW_ADVANCED_LIVENESS_CHALLENGES = 'true';
    process.env.FACE_LIVENESS_CHALLENGE_TYPES = 'LEFT,TURN,';
    const { service } = makeService();

    const challenge = await service.issueChallenge('device-1');

    expect(challenge.challengeType).toBe('BLINK');
  });

  it('rejects missing supplied challenge type without throwing a raw TypeError', async () => {
    const { service } = makeService();

    await expect(
      service.consumeNonce('device-1', 'nonce-1', undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('consumes a nonce using the aliased returned challenge type', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ challengeType: 'BLINK' }]),
    };
    const service = new LivenessService({} as any, dataSource as any);

    await expect(
      service.consumeNonce('device-1', 'nonce-1', 'blink'),
    ).resolves.toBe(true);

    expect(dataSource.query.mock.calls[0][0]).toContain(
      'RETURNING challenge_type AS "challengeType"',
    );
  });
});
