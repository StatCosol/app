import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  decryptRosterEmbedding,
  ROSTER_EMBEDDING_TTL_MS,
} from './punch/roster-crypto.util';
import { MobileAttendancePunchesController } from './mobile-attendance-punches.controller';

function makeController() {
  const punchService = {
    recordPunch: jest.fn().mockResolvedValue({ ok: true }),
    getRoster: jest.fn(),
    listReviewPunches: jest.fn(),
  };
  const deviceService = {
    findById: jest.fn(),
  };
  const controller = new MobileAttendancePunchesController(
    punchService as any,
    deviceService as any,
  );
  return { controller, punchService, deviceService };
}

describe('MobileAttendancePunchesController', () => {
  const plainEnv = process.env.MOBILE_ROSTER_PLAIN_EMBEDDINGS;

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.MOBILE_ROSTER_PLAIN_EMBEDDINGS;
  });

  afterAll(() => {
    if (plainEnv === undefined) {
      delete process.env.MOBILE_ROSTER_PLAIN_EMBEDDINGS;
    } else {
      process.env.MOBILE_ROSTER_PLAIN_EMBEDDINGS = plainEnv;
    }
  });

  it('recordPunch delegates to punch service with resolved device', async () => {
    const { controller, punchService, deviceService } = makeController();
    const device = {
      id: 'device-1',
      clientId: 'client-1',
      mode: 'KIOSK',
    };
    deviceService.findById.mockResolvedValue(device);
    const req: any = {
      deviceId: 'device-1',
      ip: '127.0.0.1',
      socket: {},
      headers: { 'user-agent': 'kiosk' },
    };
    const dto = { frames: [] } as any;

    await controller.recordPunch(req, dto);

    expect(punchService.recordPunch).toHaveBeenCalledWith(
      device,
      dto,
      '127.0.0.1',
      'kiosk',
    );
  });

  it('recordPunch rejects when device lookup fails', async () => {
    const { controller, deviceService } = makeController();
    deviceService.findById.mockResolvedValue(null);

    await expect(
      controller.recordPunch({ deviceId: 'missing' } as any, {} as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('getRoster rejects non-kiosk devices', async () => {
    const { controller, deviceService, punchService } = makeController();
    deviceService.findById.mockResolvedValue({
      id: 'device-1',
      mode: 'ESS',
    });

    await expect(
      controller.getRoster({ deviceId: 'device-1' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(punchService.getRoster).not.toHaveBeenCalled();
  });

  it('getRoster returns device-bound encrypted embeddings by default', async () => {
    const { controller, deviceService, punchService } = makeController();
    deviceService.findById.mockResolvedValue({
      id: 'device-1',
      mode: 'KIOSK',
    });
    const embedding = new Float32Array([1, 0, 0, 0]);
    const embeddingBytes = Buffer.from(
      embedding.buffer,
      embedding.byteOffset,
      embedding.byteLength,
    );
    punchService.getRoster.mockResolvedValue([
      {
        subjectId: 'emp-1',
        displayName: 'Alice',
        embeddingModel: 'mobilefacenet',
        embedding,
      },
    ]);

    const before = Date.now();
    const res = await controller.getRoster({
      deviceId: 'device-1',
      deviceInstallToken: 'install-token',
    } as any);
    const after = Date.now();

    expect(res.format).toBe('encrypted-v1');
    expect(res.deviceId).toBe('device-1');
    expect(new Date(res.expiresAt).getTime()).toBeGreaterThanOrEqual(
      before + ROSTER_EMBEDDING_TTL_MS - 1000,
    );
    expect(new Date(res.expiresAt).getTime()).toBeLessThanOrEqual(
      after + ROSTER_EMBEDDING_TTL_MS + 1000,
    );
    expect(res.enrollments[0]).toEqual(
      expect.objectContaining({
        employeeId: 'emp-1',
        displayName: 'Alice',
        embeddingModel: 'mobilefacenet',
        embeddingCipherB64: expect.any(String),
      }),
    );
    expect(res.enrollments[0]).not.toHaveProperty('embeddingB64');
    const entry = res.enrollments[0] as {
      embeddingCipherB64: string;
    };
    const decoded = decryptRosterEmbedding(
      'device-1',
      'install-token',
      entry.embeddingCipherB64,
    );
    expect(Buffer.compare(decoded, embeddingBytes)).toBe(0);
  });

  it('getRoster can return plain embeddings when legacy flag is enabled', async () => {
    process.env.MOBILE_ROSTER_PLAIN_EMBEDDINGS = 'true';
    const { controller, deviceService, punchService } = makeController();
    deviceService.findById.mockResolvedValue({
      id: 'device-1',
      mode: 'KIOSK',
    });
    const embedding = new Float32Array([1, 0, 0, 0]);
    punchService.getRoster.mockResolvedValue([
      {
        subjectId: 'emp-1',
        displayName: 'Alice',
        embeddingModel: 'mobilefacenet',
        embedding,
      },
    ]);

    const res = await controller.getRoster({
      deviceId: 'device-1',
      deviceInstallToken: 'install-token',
    } as any);

    expect(res.format).toBe('plain-v1');
    const entry = res.enrollments[0] as { embeddingB64: string };
    expect(entry.embeddingB64).toBe(
      Buffer.from(embedding.buffer).toString('base64'),
    );
  });
});
