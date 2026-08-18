import { FaceDeskOfflineSyncService } from './facedesk-offline-sync.service';
import { InternalServerErrorException } from '@nestjs/common';

describe('FaceDeskOfflineSyncService', () => {
  const attendance = { markAttendance: jest.fn() };
  const dataSource = { query: jest.fn().mockResolvedValue(undefined) };

  const makeService = () =>
    new FaceDeskOfflineSyncService(dataSource as any, attendance as any);

  beforeEach(() => jest.clearAllMocks());

  it('counts REVIEW as synced and drops a deterministic RETRY', async () => {
    attendance.markAttendance
      .mockResolvedValueOnce({
        status: 'MARKED',
        message: 'Marked — pending branch verification',
      })
      .mockResolvedValueOnce({
        status: 'RETRY',
        message: 'Face not recognized',
      });

    const service = makeService();
    const res = await service.offlineSync('c1', 'b1', 'd1', [
      { offlineRef: 'a', frames: [] } as any,
      { offlineRef: 'b', frames: [] } as any,
    ]);

    expect(res).toEqual(
      expect.objectContaining({
        synced: 1,
        failed: 1,
        results: [
          expect.objectContaining({ offlineRef: 'a', status: 'REVIEW' }),
          // Fixed replay frames can't improve → terminal, not retryable.
          expect.objectContaining({ offlineRef: 'b', status: 'DROPPED' }),
        ],
      }),
    );
  });

  it('treats a below-threshold replay as terminal so it never loops on the kiosk queue', async () => {
    // Deterministic RETRY (fixed frames) must NOT come back as retryable —
    // otherwise the entry (and its PIN) is retained forever and a failed
    // attempt is logged on every sync run.
    attendance.markAttendance.mockResolvedValue({
      status: 'RETRY',
      message: 'Face not recognized',
    });

    const service = makeService();
    const res = await service.offlineSync('c1', 'b1', 'd1', [
      { offlineRef: 'stuck', pin: '1234', frames: [] } as any,
    ]);

    expect(res.results[0]?.status).toBe('DROPPED');
    expect(res.results[0]?.status).not.toBe('RETRY');
  });

  it('classifies duplicate offline refs separately', async () => {
    attendance.markAttendance.mockResolvedValue({
      status: 'MARKED',
      message: 'Attendance already recorded',
    });

    const service = makeService();
    const res = await service.offlineSync('c1', 'b1', 'd1', [
      { offlineRef: 'dup-1', frames: [] } as any,
    ]);

    expect(res.duplicateSkipped).toBe(1);
    expect(res.results[0]?.status).toBe('DUPLICATE');
  });

  it('reports transient markAttendance failures as RETRY', async () => {
    attendance.markAttendance.mockRejectedValue(
      new InternalServerErrorException('database unavailable'),
    );

    const service = makeService();
    const res = await service.offlineSync('c1', 'b1', 'd1', [
      { offlineRef: 'x', frames: [] } as any,
    ]);

    expect(res.results[0]).toEqual(
      expect.objectContaining({ offlineRef: 'x', status: 'RETRY' }),
    );
    expect(res.failed).toBe(1);
  });
});
