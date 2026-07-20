import { BiometricService } from './biometric.service';

describe('BiometricService', () => {
  const makeService = (opts: { dayPunches: any[]; existing?: any }) => {
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
        captureMethod: 'BIOMETRIC',
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
});
