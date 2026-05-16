import { FaceFailureAlertCronService } from './face-failure-alert-cron.service';
import { DataSource } from 'typeorm';

describe('FaceFailureAlertCronService.runDetector', () => {
  const makeService = (queryImpl: jest.Mock) => {
    const ds = { query: queryImpl } as unknown as DataSource;
    return new FaceFailureAlertCronService(ds);
  };

  afterEach(() => {
    delete process.env.FACE_FAIL_ALERT_THRESHOLD;
    delete process.env.FACE_FAIL_ALERT_WINDOW_HOURS;
    delete process.env.FACE_FAIL_ALERT_DEDUPE_HOURS;
  });

  it('returns zero counts when no candidates cross threshold', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const svc = makeService(query);

    const summary = await svc.runDetector();

    expect(summary).toEqual({
      threshold: 20,
      windowHours: 24,
      dedupeHours: 20,
      clientId: null,
      branchId: null,
      candidates: 0,
      emitted: 0,
      skipped: 0,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('emits inserts for candidates that are not duplicates', async () => {
    const query = jest
      .fn()
      // aggregation: 2 candidates
      .mockResolvedValueOnce([
        { clientId: 'c1', branchId: 'b1', count: 30, lastAt: new Date() },
        { clientId: 'c2', branchId: null, count: 25, lastAt: new Date() },
      ])
      // dedupe lookup #1 -> not dup
      .mockResolvedValueOnce([])
      // insert #1
      .mockResolvedValueOnce(undefined)
      // dedupe lookup #2 -> not dup
      .mockResolvedValueOnce([])
      // insert #2
      .mockResolvedValueOnce(undefined);

    const svc = makeService(query);
    const summary = await svc.runDetector();

    expect(summary.candidates).toBe(2);
    expect(summary.emitted).toBe(2);
    expect(summary.skipped).toBe(0);
    // 1 aggregation + 2 * (dedupe + insert) = 5
    expect(query).toHaveBeenCalledTimes(5);
  });

  it('skips candidates whose dedupe window already has an alert', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { clientId: 'c1', branchId: 'b1', count: 30, lastAt: new Date() },
      ])
      // dedupe lookup -> dup found
      .mockResolvedValueOnce([{}]);

    const svc = makeService(query);
    const summary = await svc.runDetector();

    expect(summary.emitted).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.candidates).toBe(1);
    // no insert call
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('uses overrides over env vars and clamps them', async () => {
    process.env.FACE_FAIL_ALERT_THRESHOLD = '50';
    process.env.FACE_FAIL_ALERT_WINDOW_HOURS = '12';
    const query = jest.fn().mockResolvedValueOnce([]);

    const svc = makeService(query);
    const summary = await svc.runDetector({
      threshold: 5,
      windowHours: 9999, // clamped to 720
      dedupeHours: -10, // clamped to 0
    });

    expect(summary.threshold).toBe(5);
    expect(summary.windowHours).toBe(720);
    expect(summary.dedupeHours).toBe(0);
    // SQL params: [threshold, windowHours]
    const args = query.mock.calls[0]?.[1] as unknown[];
    expect(args[0]).toBe(5);
    expect(args[1]).toBe('720');
  });

  it('per-client override drives the emitted message threshold', async () => {
    const query = jest
      .fn()
      // aggregation: 1 candidate, effectiveThreshold from the JOIN = 5
      .mockResolvedValueOnce([
        {
          clientId: 'c1',
          branchId: 'b1',
          count: 7,
          lastAt: new Date(),
          effectiveThreshold: 5,
        },
      ])
      .mockResolvedValueOnce([]) // dedupe miss
      .mockResolvedValueOnce(undefined); // insert

    const svc = makeService(query);
    const summary = await svc.runDetector();

    expect(summary.emitted).toBe(1);
    // The aggregation SQL must JOIN clients and select effectiveThreshold.
    const aggSql = query.mock.calls[0]?.[0] as string;
    expect(aggSql).toContain('JOIN clients');
    expect(aggSql).toContain('face_fail_alert_threshold');
    expect(aggSql).toContain('effectiveThreshold');
    // The insert message should reflect the per-client override (5),
    // not the global default (20), and call it out.
    const insertParams = query.mock.calls[2]?.[1] as unknown[];
    const message = insertParams[3] as string;
    expect(message).toContain('Threshold: 5');
    expect(message).toContain('per-client override');
  });

  it('swallows DB errors and returns zeroed summary', async () => {
    const query = jest.fn().mockRejectedValueOnce(new Error('boom'));
    const svc = makeService(query);

    const summary = await svc.runDetector();
    expect(summary.candidates).toBe(0);
    expect(summary.emitted).toBe(0);
    expect(summary.skipped).toBe(0);
    // sane defaults still returned
    expect(summary.threshold).toBe(20);
  });
});
