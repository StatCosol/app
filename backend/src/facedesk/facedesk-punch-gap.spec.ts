import { FaceDeskPunchDirectionService } from './facedesk-punch-direction.service';

/**
 * The minimum-gap check decides whether real attendance is recorded, so the
 * boundaries matter more than the happy path: a first punch of the day must
 * never be refused, and a punch just past the gap must always be allowed.
 */
function makeService(lastPunchTime: Date | null) {
  const dataSource = {
    query: jest
      .fn()
      .mockResolvedValue(lastPunchTime ? [{ punch_time: lastPunchTime }] : []),
  };
  return {
    svc: new FaceDeskPunchDirectionService(dataSource as never),
    dataSource,
  };
}

describe('minutesSinceLastPunch', () => {
  const now = new Date('2026-09-04T10:00:00.000Z');

  it('returns null when the subject has no punch today', () => {
    // The first punch of a day must never be refused because of one the night
    // before — the query is scoped to the business day for exactly this.
    const { svc } = makeService(null);
    return expect(
      svc.minutesSinceLastPunch('c1', 'e1', 'EMPLOYEE', now),
    ).resolves.toBeNull();
  });

  it('measures the gap in minutes', async () => {
    const { svc } = makeService(new Date('2026-09-04T09:58:00.000Z'));
    await expect(
      svc.minutesSinceLastPunch('c1', 'e1', 'EMPLOYEE', now),
    ).resolves.toBeCloseTo(2, 5);
  });

  it('reads the contractor roster for a contractor', async () => {
    // Contractor punches live in contractor_biometric_punches, employees in
    // facedesk_attendance_logs. Querying the wrong one silently returns null,
    // which would let every contractor double-punch.
    const { svc, dataSource } = makeService(
      new Date('2026-09-04T09:59:00.000Z'),
    );
    await svc.minutesSinceLastPunch('c1', 'ce1', 'CONTRACTOR', now);
    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain('contractor_biometric_punches');
    expect(sql).toContain('contractor_employee_id');
  });

  it('reads the employee roster for an employee', async () => {
    const { svc, dataSource } = makeService(
      new Date('2026-09-04T09:59:00.000Z'),
    );
    await svc.minutesSinceLastPunch('c1', 'e1', 'EMPLOYEE', now);
    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain('facedesk_attendance_logs');
    expect(sql).toContain('employee_id');
  });

  it('only counts punches that actually stand', async () => {
    // A rejected or review-pending punch must not block the retry that follows
    // it, or a refused capture would lock the worker out for the gap.
    const { svc, dataSource } = makeService(new Date('2026-09-04T09:59:00Z'));
    await svc.minutesSinceLastPunch('c1', 'e1', 'EMPLOYEE', now);
    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain("attendance_status IN ('MARKED','APPROVED')");
  });

  it('takes the most recent punch, not the first', async () => {
    const { svc, dataSource } = makeService(new Date('2026-09-04T09:59:00Z'));
    await svc.minutesSinceLastPunch('c1', 'e1', 'EMPLOYEE', now);
    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain('ORDER BY punch_time DESC');
    expect(sql).toContain('LIMIT 1');
  });
});
