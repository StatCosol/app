import { FaceDeskDashboardService } from './facedesk-dashboard.service';

describe('FaceDeskDashboardService', () => {
  function dataSourceFor(attendance: { present: string; punches: string }) {
    return {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ total: '12', enrolled: '10' }])
        .mockResolvedValueOnce([attendance])
        .mockResolvedValueOnce([{ n: '2' }])
        .mockResolvedValueOnce([{ n: '1' }])
        .mockResolvedValueOnce([{ n: '3' }])
        .mockResolvedValueOnce([
          { online: '1', offline: '1', last_sync: null },
        ]),
    };
  }

  it('reports accepted punch rows separately from distinct employees present', async () => {
    const dataSource = dataSourceFor({ present: '3', punches: '8' });
    const service = new FaceDeskDashboardService(dataSource as any);

    const result = await service.cards('client-1');

    expect(result.todayPresent).toBe(3);
    expect(result.todayPunches).toBe(8);
    expect(result.todayAbsent).toBe(7);
    expect(dataSource.query.mock.calls[1][0]).toContain(
      'count(DISTINCT employee_id)::int AS present',
    );
    expect(dataSource.query.mock.calls[1][0]).toContain(
      'count(*)::int AS punches',
    );
  });
});
