import { FaceDeskReportsService } from './facedesk-reports.service';

describe('FaceDeskReportsService.pushToPayroll', () => {
  it('maps approved attendance to biometric ingest items and reports counts', async () => {
    const rows = [
      {
        employeeCode: 'E001',
        punchTime: new Date('2026-07-07T04:00:00.000Z'),
        punchType: 'IN',
        deviceId: 'dev-1',
        branchId: 'b1',
      },
      {
        employeeCode: 'E001',
        punchTime: new Date('2026-07-07T12:00:00.000Z'),
        punchType: 'OUT',
        deviceId: null,
        branchId: null,
      },
    ];
    const dataSource = { query: jest.fn().mockResolvedValue(rows) };
    const ingest = jest.fn(async () => ({ received: 2, inserted: 2 }));
    const biometric = { ingest };
    const service = new FaceDeskReportsService(
      dataSource as any,
      biometric as any,
    );

    const res = await service.pushToPayroll('c1', {
      from: '2026-07-07T00:00:00.000Z',
      to: '2026-07-08T00:00:00.000Z',
    });

    expect(res).toEqual({ pushed: 2, received: 2 });
    const call = ingest.mock.calls[0] as unknown as [string, any[], boolean];
    const clientId = call[0];
    const items = call[1];
    const autoProcess = call[2];
    expect(clientId).toBe('c1');
    expect(autoProcess).toBe(true);
    expect(items[0]).toEqual(
      expect.objectContaining({
        employeeCode: 'E001',
        direction: 'IN',
        deviceId: 'dev-1',
        branchId: 'b1',
        source: 'MOBILE_KIOSK',
      }),
    );
    // null device falls back to a stable id; null branch → undefined
    expect(items[1].deviceId).toBe('facedesk');
    expect(items[1].branchId).toBeUndefined();
  });

  it('no-ops when there is no approved attendance', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    const biometric = { ingest: jest.fn() };
    const service = new FaceDeskReportsService(
      dataSource as any,
      biometric as any,
    );
    const res = await service.pushToPayroll('c1', {});
    expect(res).toEqual({ pushed: 0, received: 0 });
    expect(biometric.ingest).not.toHaveBeenCalled();
  });
});
