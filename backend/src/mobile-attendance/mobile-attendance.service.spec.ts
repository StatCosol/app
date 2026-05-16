import { MobileAttendanceService } from './mobile-attendance.service';

describe('MobileAttendanceService.listFaceFailureAlerts', () => {
  const makeService = (queryImpl: jest.Mock) => {
    const faceRepo: any = { manager: { query: queryImpl } };
    // The method under test only touches faceRepo.manager.query; all other
    // constructor deps are unused. Cast through any to keep this test tight.
    return new MobileAttendanceService(
      faceRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  };

  it('short-circuits to empty array when allowedBranchIds is an empty list', async () => {
    const query = jest.fn();
    const svc = makeService(query);

    const rows = await svc.listFaceFailureAlerts('client-1', [], 20);

    expect(rows).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('queries without branch filter when allowedBranchIds is null', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const svc = makeService(query);

    await svc.listFaceFailureAlerts('client-1', null, 10);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).not.toContain('"branchId" = ANY');
    expect(params).toEqual(['client-1']);
    expect(sql).toContain("status = 'OPEN'");
    expect(sql).toContain("\"entityType\" = 'FACE_FAILURE'");
    expect(sql).toContain('LIMIT 10');
  });

  it('applies ANY(uuid[]) filter when branch scope is provided', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const svc = makeService(query);
    const branches = ['b1', 'b2'];

    await svc.listFaceFailureAlerts('client-1', branches, 5);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('"branchId" = ANY($2::uuid[])');
    expect(params).toEqual(['client-1', branches]);
    expect(sql).toContain('LIMIT 5');
  });

  it('clamps limit into 1..100', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const svc = makeService(query);

    await svc.listFaceFailureAlerts('client-1', null, 999);
    expect(query.mock.calls[0][0]).toContain('LIMIT 100');

    await svc.listFaceFailureAlerts('client-1', null, 0);
    expect(query.mock.calls[1][0]).toContain('LIMIT 20'); // 0 -> falls back to default 20
  });

  it('normalizes Date createdAt to ISO string in returned rows', async () => {
    const fixed = new Date('2026-05-15T10:20:30Z');
    const query = jest.fn().mockResolvedValueOnce([
      {
        id: 'n1',
        branchId: 'b1',
        title: 'spike',
        message: 'msg',
        priority: 'HIGH',
        createdAt: fixed,
      },
      {
        id: 'n2',
        branchId: null,
        title: 'spike2',
        message: null,
        priority: 'HIGH',
        createdAt: '2026-05-14T01:02:03Z',
      },
    ]);
    const svc = makeService(query);

    const rows = await svc.listFaceFailureAlerts('client-1', null);
    expect(rows[0].createdAt).toBe(fixed.toISOString());
    expect(rows[1].createdAt).toBe('2026-05-14T01:02:03Z');
  });
});
