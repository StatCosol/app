import { BiometricService } from '../../biometric/biometric.service';

/**
 * Integration-style coverage for the employee face-attendance payroll path:
 * clean kiosk punch ingest → biometric_punches → attendance_records.
 *
 * Payroll engines read attendance_records; this spec guards the upstream chain
 * that FaceDesk pushToPayroll and mobile punch approval both depend on.
 */
describe('Face attendance pipeline (ingest → attendance_records)', () => {
  const makeService = (opts: {
    dayPunches: any[];
    existing?: any;
    insertIdentifiers?: any[];
  }) => {
    const updateExecute = jest.fn(async () => ({
      affected: opts.dayPunches.length,
    }));
    const insertExecute = jest.fn(async () => ({
      identifiers: opts.insertIdentifiers ?? [{ id: 'bio-1' }],
    }));
    let qbCall = 0;
    const punchRepo = {
      find: jest.fn(async () => opts.dayPunches),
      createQueryBuilder: jest.fn(() => {
        qbCall += 1;
        if (qbCall === 1) {
          return {
            insert: jest.fn().mockReturnThis(),
            into: jest.fn().mockReturnThis(),
            values: jest.fn().mockReturnThis(),
            orIgnore: jest.fn().mockReturnThis(),
            execute: insertExecute,
          };
        }
        return {
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          execute: updateExecute,
        };
      }),
      manager: { query: jest.fn() },
    };
    const empRepo = {
      find: jest.fn(async () => [
        {
          id: 'employee-1',
          clientId: 'client-1',
          branchId: 'branch-1',
          employeeCode: 'E001',
        },
      ]),
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
    return { service, punchRepo, empRepo, attRepo, insertExecute };
  };

  it('ingests a clean mobile kiosk IN punch and upserts daily attendance', async () => {
    const { service, attRepo } = makeService({
      dayPunches: [
        {
          id: 'punch-in',
          punchTime: new Date('2026-08-09T03:30:00.000Z'),
          direction: 'IN',
          source: 'MOBILE_KIOSK',
        },
      ],
    });

    const result = await service.ingest(
      'client-1',
      [
        {
          employeeCode: 'E001',
          punchTime: '2026-08-09T03:30:00.000Z',
          direction: 'IN',
          deviceId: 'device-1',
          branchId: 'branch-1',
          source: 'MOBILE_KIOSK',
        },
      ],
      true,
    );

    expect(result.inserted).toBe(1);
    expect(result.attendanceUpserts).toBeGreaterThan(0);
    expect(attRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'employee-1',
        captureMethod: 'FACE',
        approvalStatus: 'PENDING',
      }),
    );
  });

  it('skips attendance upsert when ingest receives unknown employee codes', async () => {
    const { service, attRepo, empRepo } = makeService({ dayPunches: [] });
    empRepo.find.mockResolvedValueOnce([]);

    const result = await service.ingest(
      'client-1',
      [
        {
          employeeCode: 'UNKNOWN',
          punchTime: '2026-08-09T03:30:00.000Z',
          direction: 'IN',
          source: 'MOBILE_KIOSK',
        },
      ],
      true,
    );

    expect(result.unknownEmployees).toEqual(['UNKNOWN']);
    expect(result.attendanceUpserts).toBe(0);
    expect(attRepo.save).not.toHaveBeenCalled();
  });
});
