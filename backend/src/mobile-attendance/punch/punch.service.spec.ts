import { PunchService } from './punch.service';
import { MobileAttendanceDeviceEntity } from '../devices/device.entity';

describe('PunchService', () => {
  const embedding = new Float32Array([1, 0, 0, 0]);
  const embeddingB64 = Buffer.from(embedding.buffer).toString('base64');
  const embeddingBuffer = Buffer.from(embedding.buffer);

  const makeService = (rows: {
    employeeRows?: any[];
    contractorRows?: any[];
    cooldownRows?: any[];
    todayRows?: any[];
  }) => {
    const punchRepo = {
      save: jest.fn(async (row) => ({ id: 'punch-1', ...row })),
    };
    const contractorPunchRepo = {
      save: jest.fn(async (row) => ({ id: 'contractor-punch-1', ...row })),
    };
    const biometricService = {
      ingest: jest.fn(async () => ({ attendanceUpserts: 1 })),
    };
    const transactionManager = {
      getRepository: jest.fn(() => punchRepo),
    };
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce(rows.employeeRows ?? [])
        .mockResolvedValueOnce(rows.contractorRows ?? [])
        .mockResolvedValueOnce(rows.cooldownRows ?? [])
        .mockResolvedValueOnce(rows.todayRows ?? []),
      transaction: jest.fn(async (callback) => callback(transactionManager)),
    };

    const service = new PunchService(
      {} as any,
      {} as any,
      punchRepo as any,
      contractorPunchRepo as any,
      { livenessRequired: false } as any,
      { uploadPhoto: jest.fn() } as any,
      biometricService as any,
      dataSource as any,
    );

    return {
      service,
      punchRepo,
      contractorPunchRepo,
      biometricService,
      dataSource,
      transactionManager,
    };
  };

  const device = {
    id: 'device-1',
    clientId: 'client-1',
    branchId: 'branch-1',
    mode: 'KIOSK',
  } as MobileAttendanceDeviceEntity;

  const dto = {
    embeddingB64,
    embeddingModel: 'mobilefacenet',
    direction: 'IN' as const,
    punchTime: '2026-07-04T02:30:00.000Z',
    isMockLocation: false,
    isRooted: false,
    offlineSync: false,
  };

  it('mirrors accepted employee face punches into the daily attendance pipeline', async () => {
    const { service, biometricService, dataSource, transactionManager } =
      makeService({
        employeeRows: [
          {
            employeeId: 'employee-1',
            name: 'Employee One',
            employeeCode: 'E001',
            embedding: embeddingBuffer,
            embeddingModel: 'mobilefacenet',
            enrolledAt: new Date(Date.now() - 60_000),
          },
        ],
      });

    await service.recordPunch(device, dto);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(biometricService.ingest).toHaveBeenCalledWith(
      'client-1',
      [
        {
          employeeCode: 'E001',
          punchTime: '2026-07-04T02:30:00.000Z',
          direction: 'IN',
          deviceId: 'device-1',
          branchId: 'branch-1',
          source: 'MOBILE_KIOSK',
        },
      ],
      true,
      transactionManager,
    );
  });

  it('records the second employee face punch as OUT even when an old APK sends IN', async () => {
    const previousPunch = {
      punch_time: new Date('2026-07-04T02:00:00.000Z'),
      direction: 'IN',
    };
    const { service, punchRepo, biometricService } = makeService({
      employeeRows: [
        {
          employeeId: 'employee-1',
          name: 'Employee One',
          employeeCode: 'E001',
          embedding: embeddingBuffer,
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
      cooldownRows: [previousPunch],
      todayRows: [previousPunch],
    });

    const resp = await service.recordPunch(device, dto);

    expect(resp.direction).toBe('OUT');
    expect(punchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'OUT' }),
    );
    expect(biometricService.ingest).toHaveBeenCalledWith(
      'client-1',
      [
        expect.objectContaining({
          direction: 'OUT',
          employeeCode: 'E001',
        }),
      ],
      true,
      expect.anything(),
    );
  });

  it('records employee face punch as OUT after a biometric device IN on the same day', async () => {
    const biometricIn = {
      punch_time: new Date('2026-07-04T02:00:00.000Z'),
      direction: 'IN',
    };
    const { service, punchRepo, biometricService, dataSource } = makeService({
      employeeRows: [
        {
          employeeId: 'employee-1',
          name: 'Employee One',
          employeeCode: 'E001',
          embedding: embeddingBuffer,
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
      cooldownRows: [],
      todayRows: [biometricIn],
    });

    const resp = await service.recordPunch(device, dto);

    expect(dataSource.query.mock.calls[3][0]).toContain('biometric_punches');
    expect(resp.direction).toBe('OUT');
    expect(punchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'OUT' }),
    );
    expect(biometricService.ingest).toHaveBeenCalledWith(
      'client-1',
      [
        expect.objectContaining({
          direction: 'OUT',
          employeeCode: 'E001',
        }),
      ],
      true,
      expect.anything(),
    );
  });

  it('rejects another employee face punch after IN and OUT are already recorded for the day', async () => {
    const { service, punchRepo, biometricService } = makeService({
      employeeRows: [
        {
          employeeId: 'employee-1',
          name: 'Employee One',
          employeeCode: 'E001',
          embedding: embeddingBuffer,
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
      cooldownRows: [{ punch_time: new Date('2026-07-04T02:00:00.000Z') }],
      todayRows: [
        { punch_time: new Date('2026-07-04T01:00:00.000Z'), direction: 'IN' },
        { punch_time: new Date('2026-07-04T02:00:00.000Z'), direction: 'OUT' },
      ],
    });

    await expect(service.recordPunch(device, dto)).rejects.toThrow(
      'Attendance already completed for today',
    );
    expect(punchRepo.save).not.toHaveBeenCalled();
    expect(biometricService.ingest).not.toHaveBeenCalled();
  });

  it('keeps contractor face punches out of the employee daily attendance pipeline', async () => {
    const { service, biometricService } = makeService({
      contractorRows: [
        {
          contractorEmployeeId: 'contractor-1',
          name: 'Contractor One',
          embedding: embeddingBuffer,
          embeddingModel: 'mobilefacenet',
          enrolledAt: new Date(Date.now() - 60_000),
        },
      ],
    });

    await service.recordPunch(device, dto);

    expect(biometricService.ingest).not.toHaveBeenCalled();
  });
});
