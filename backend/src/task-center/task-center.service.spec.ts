import { TaskCenterService } from './task-center.service';
import {
  operationalDate,
  validCalendarDate,
  addCalendarDays,
} from '../common/operational-date';

describe('Operational deadlines', () => {
  afterEach(() => jest.useRealTimers());
  it('uses the Indian calendar day across UTC midnight and rejects impossible dates', () => {
    expect(operationalDate(new Date('2026-09-12T18:29:59Z'))).toBe(
      '2026-09-12',
    );
    expect(operationalDate(new Date('2026-09-12T18:30:00Z'))).toBe(
      '2026-09-13',
    );
    expect(validCalendarDate('2026-02-29')).toBe(false);
    expect(validCalendarDate('2028-02-29')).toBe(true);
    expect(validCalendarDate(null)).toBe(false);
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('counts today as due soon and excludes cancelled/closed tasks from overdue', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-12T18:00:00Z'));
    const rows = [
      { id: 'past', status: 'OPEN', due_date: '2026-09-11' },
      { id: 'today', status: 'IN_PROGRESS', due_date: '2026-09-12' },
      { id: 'cancelled', status: 'CANCELLED', due_date: '2026-09-10' },
      { id: 'closed', status: 'CLOSED', due_date: '2026-09-10' },
      { id: 'future', status: 'OPEN', due_date: '2026-09-19' },
      { id: 'undated', status: 'OPEN', due_date: null },
    ];
    const service = new TaskCenterService({
      query: jest.fn().mockResolvedValue(rows),
    } as any);
    expect(await service.getMySummary({ role: 'ADMIN' })).toMatchObject({
      total: 6,
      open: 3,
      inProgress: 1,
      overdue: 1,
      dueSoon: 2,
      closed: 1,
    });
    expect(
      (await service.getOverdueItems({ role: 'ADMIN' })).map((x) => x.id),
    ).toEqual(['past']);
    expect(
      (await service.getExpiringItems({ role: 'ADMIN', withinDays: 0 })).map(
        (x) => x.id,
      ),
    ).toEqual(['today']);
    await expect(
      service.getExpiringItems({ role: 'ADMIN', withinDays: NaN }),
    ).rejects.toThrow('withinDays');
  });
  it('parameterizes legacy payroll module and role restrictions', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new TaskCenterService({ query } as any).getMyItems({
      role: 'PAYROLL',
      assignedRoles: ['PAYROLL', 'ADMIN'],
      taskModules: ['PAYROLL'],
      clientIds: ['c'],
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('t.module = ANY($2::text[])'),
      [['PAYROLL', 'ADMIN'], ['PAYROLL'], ['c']],
    );
  });
});
