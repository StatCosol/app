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
    expect(sql).toContain('"entityType" = \'FACE_FAILURE\'');
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

describe('MobileAttendanceService.resolveDeviceByToken (androidId binding)', () => {
  const makeService = (deviceRow: any, saveSpy?: jest.Mock) => {
    const save = saveSpy ?? jest.fn(async (_e: any, v: any) => v);
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(deviceRow),
    };
    const mgr = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      save,
    };
    const ds: any = {
      transaction: jest.fn(async (fn: any) => fn(mgr)),
    };
    return new MobileAttendanceService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      ds,
    );
  };

  it('claims androidId on first use when row is unbound and fresh', async () => {
    const row: any = {
      id: 'd1',
      isActive: true,
      androidId: null,
      registeredAt: new Date(),
    };
    const save = jest.fn(async (_e: any, v: any) => v);
    const svc = makeService(row, save);
    const out = await svc.resolveDeviceByToken('tok', 'android-xyz');
    expect(out.androidId).toBe('android-xyz');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('accepts when supplied androidId matches the bound value', async () => {
    const row: any = { id: 'd1', isActive: true, androidId: 'android-xyz' };
    const svc = makeService(row);
    await expect(svc.resolveDeviceByToken('tok', 'android-xyz')).resolves.toBe(
      row,
    );
  });

  it('rejects when supplied androidId differs from the bound value', async () => {
    const row: any = { id: 'd1', isActive: true, androidId: 'android-xyz' };
    const svc = makeService(row);
    await expect(
      svc.resolveDeviceByToken('tok', 'attacker-phone'),
    ).rejects.toThrow(/already activated/i);
  });

  it('rejects when header is missing', async () => {
    const row: any = { id: 'd1', isActive: true, androidId: 'android-xyz' };
    const svc = makeService(row);
    await expect(svc.resolveDeviceByToken('tok', '')).rejects.toThrow(
      /header missing/i,
    );
    await expect(svc.resolveDeviceByToken('tok', undefined)).rejects.toThrow(
      /header missing/i,
    );
  });

  it('rejects missing header even when row is not bound yet', async () => {
    const row: any = { id: 'd1', isActive: true, androidId: null };
    const svc = makeService(row);
    await expect(svc.resolveDeviceByToken('tok', '')).rejects.toThrow(
      /header missing/i,
    );
  });

  it('rejects stale unbound install codes', async () => {
    const row: any = {
      id: 'd1',
      isActive: true,
      androidId: null,
      registeredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    };
    const svc = makeService(row);
    await expect(svc.resolveDeviceByToken('tok', 'android-xyz')).rejects.toThrow(
      /expired before activation/i,
    );
  });

  it('allows an old code when it is already bound to the same device', async () => {
    const row: any = {
      id: 'd1',
      isActive: true,
      androidId: 'android-xyz',
      registeredAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    };
    const svc = makeService(row);
    await expect(svc.resolveDeviceByToken('tok', 'android-xyz')).resolves.toBe(
      row,
    );
  });

  it('throws Unauthorized on revoked (isActive=false) device', async () => {
    const row: any = { id: 'd1', isActive: false, androidId: null };
    const svc = makeService(row);
    await expect(
      svc.resolveDeviceByToken('tok', 'android-xyz'),
    ).rejects.toThrow(/invalid device token/i);
  });

  it('throws Unauthorized when token is empty', async () => {
    const svc = makeService(null);
    await expect(svc.resolveDeviceByToken('', 'x')).rejects.toThrow(
      /missing device token/i,
    );
  });
});

describe('MobileAttendanceService post-logout cooldown direction handling', () => {
  const makeService = () =>
    new MobileAttendanceService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ) as any;

  it('treats explicit OUT as a logout regardless of same-day prior punches', () => {
    expect(makeService().isLogoutCooldownViolation('OUT', 0)).toBe(true);
  });

  it('treats AUTO as logout only when it is not the first same-day punch', () => {
    const svc = makeService();
    expect(svc.isLogoutCooldownViolation('AUTO', 0)).toBe(false);
    expect(svc.isLogoutCooldownViolation('AUTO', 1)).toBe(true);
  });

  it('does not treat explicit IN as logout', () => {
    expect(makeService().isLogoutCooldownViolation('IN', 3)).toBe(false);
  });
});
