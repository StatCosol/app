import { FaceDeskOfflineSyncService } from './facedesk-offline-sync.service';

describe('FaceDeskOfflineSyncService', () => {
  const attendance = { markAttendance: jest.fn() };
  const dataSource = { query: jest.fn().mockResolvedValue(undefined) };

  const makeService = () =>
    new FaceDeskOfflineSyncService(dataSource as any, attendance as any);

  beforeEach(() => jest.clearAllMocks());

  it('returns per-punch results and counts REVIEW as synced', async () => {
    attendance.markAttendance
      .mockResolvedValueOnce({
        status: 'MARKED',
        message: 'Marked — pending branch verification',
      })
      .mockResolvedValueOnce({ status: 'RETRY', message: 'Try again' });

    const service = makeService();
    const res = await service.offlineSync('c1', 'b1', 'd1', [
      { offlineRef: 'a', frames: [] } as any,
      { offlineRef: 'b', frames: [] } as any,
    ]);

    expect(res).toEqual(
      expect.objectContaining({
        synced: 1,
        failed: 0,
        results: [
          expect.objectContaining({ offlineRef: 'a', status: 'REVIEW' }),
          expect.objectContaining({ offlineRef: 'b', status: 'RETRY' }),
        ],
      }),
    );
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
});
