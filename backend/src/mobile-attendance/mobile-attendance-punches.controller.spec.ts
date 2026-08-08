import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
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
  beforeEach(() => jest.resetAllMocks());

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

  it('getRoster returns base64 embeddings for kiosk devices', async () => {
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

    await expect(
      controller.getRoster({ deviceId: 'device-1' } as any),
    ).resolves.toEqual({
      enrollments: [
        expect.objectContaining({
          employeeId: 'emp-1',
          displayName: 'Alice',
          embeddingModel: 'mobilefacenet',
          embeddingB64: Buffer.from(embedding.buffer).toString('base64'),
        }),
      ],
    });
  });
});
