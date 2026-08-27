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

  it('returns no client-wide card data for an empty branch scope', async () => {
    const dataSource = dataSourceFor({ present: '0', punches: '0' });
    const service = new FaceDeskDashboardService(dataSource as any);

    await service.cards('client-1', []);

    for (const [sql] of dataSource.query.mock.calls) {
      expect(sql).toContain('AND FALSE');
    }
  });

  it('applies a non-empty branch scope to every dashboard aggregate', async () => {
    const dataSource = dataSourceFor({ present: '3', punches: '8' });
    const service = new FaceDeskDashboardService(dataSource as any);

    await service.cards('client-1', ['branch-1']);

    for (const [sql, params] of dataSource.query.mock.calls) {
      expect(sql).toContain('ANY(');
      expect(params).toContainEqual(['branch-1']);
    }

    const duplicateSql = dataSource.query.mock.calls[3][0];
    expect(duplicateSql).toContain('facedesk_employee_face_profiles p');
    expect(duplicateSql).toContain("p.subject_type = 'EMPLOYEE'");
    expect(duplicateSql).toContain("p.subject_type = 'CONTRACTOR'");
    expect(duplicateSql).toContain('e.id = p.employee_id');
    expect(duplicateSql).toContain('ce.id = p.employee_id');
  });
});
