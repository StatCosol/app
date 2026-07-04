import { PunchService } from './punch.service';
import { MobileAttendanceDeviceEntity } from '../devices/device.entity';

describe('PunchService', () => {
  const embedding = new Float32Array([1, 0, 0, 0]);
  const embeddingB64 = Buffer.from(embedding.buffer).toString('base64');
  const embeddingBuffer = Buffer.from(embedding.buffer);

  const makeService = (rows: {
    employeeRows?: any[];
    contractorRows?: any[];
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
        .mockResolvedValueOnce([]),
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
