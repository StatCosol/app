import { FaceDeskEnrollmentService } from './facedesk-enrollment.service';

function makeService() {
  const dataSource = { query: jest.fn().mockResolvedValue([]) };
  const service = new FaceDeskEnrollmentService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { enabled: false } as any,
    {} as any,
    dataSource as any,
  );
  return { service, dataSource };
}

describe('FaceDeskEnrollmentService enrolled roster', () => {
  it('returns no pending rows for a branch user with no assigned branches', async () => {
    const { service, dataSource } = makeService();

    await expect(
      service.getPendingEmployees('client-1', [], 'EMPLOYEE'),
    ).resolves.toEqual([]);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('returns no rows for a branch user with no assigned branches', async () => {
    const { service, dataSource } = makeService();

    await expect(
      service.getEnrolledEmployees('client-1', [], 'EMPLOYEE'),
    ).resolves.toEqual([]);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('returns employee identity and enrollment health within branch scope', async () => {
    const { service, dataSource } = makeService();

    await service.getEnrolledEmployees('client-1', ['branch-1'], 'EMPLOYEE');

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain('FROM employees e');
    expect(sql).toContain('e.employee_code AS "employeeCode"');
    expect(sql).toContain(`p.enrollment_status = 'ENROLLED'`);
    expect(sql).toContain('p.liveness_status AS "livenessStatus"');
    expect(sql).toContain(
      '(p.attendance_pin_hash IS NOT NULL) AS "pinConfigured"',
    );
    expect(sql).toContain('p.consent_given_at AS "enrolledAt"');
    expect(sql).not.toContain('p.updated_at AS "enrolledAt"');
    expect(sql).toContain('e.branch_id = ANY($2::uuid[])');
    expect(params).toEqual(['client-1', ['branch-1'], 'EMPLOYEE']);
  });

  it('lists contractors without referencing their absent employee_code column', async () => {
    const { service, dataSource } = makeService();

    await service.getEnrolledEmployees('client-1', null, 'CONTRACTOR');

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain('FROM contractor_employees e');
    expect(sql).toContain('NULL::text AS "employeeCode"');
    expect(sql).not.toContain('e.employee_code');
    expect(params).toEqual(['client-1', 'CONTRACTOR']);
  });
});

describe('FaceDeskEnrollmentService enrollment ownership', () => {
  it('rejects an employee that does not belong to the caller client', async () => {
    const { service, dataSource } = makeService();

    await expect(
      service.saveProfile('client-1', null, 'actor-1', {
        employeeId: 'employee-1',
        frames: [],
      } as any),
    ).rejects.toThrow(/scope/i);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('id = $1 AND client_id = $2'),
      ['employee-1', 'client-1'],
    );
  });

  it('rejects a portal enrollment outside the caller branch scope', async () => {
    const { service, dataSource } = makeService();
    dataSource.query.mockResolvedValueOnce([{ branchId: 'branch-2' }]);

    await expect(
      service.saveProfile(
        'client-1',
        null,
        'actor-1',
        { employeeId: 'employee-1', frames: [] } as any,
        ['branch-1'],
      ),
    ).rejects.toThrow(/scope/i);
  });

  it('rejects a kiosk enrollment for an employee in another branch', async () => {
    const { service, dataSource } = makeService();
    dataSource.query.mockResolvedValueOnce([{ branchId: 'branch-2' }]);

    await expect(
      service.saveProfile('client-1', 'branch-1', 'device-1', {
        employeeId: 'employee-1',
        frames: [],
      } as any),
    ).rejects.toThrow(/scope/i);
  });

  it('denies PIN reset when the caller has no assigned branches', async () => {
    const { service, dataSource } = makeService();

    await expect(
      service.setAttendancePin(
        'client-1',
        'actor-1',
        { employeeId: 'employee-1' },
        '1234',
        [],
      ),
    ).rejects.toThrow(/scope/i);
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});

describe('FaceDeskEnrollmentService deleteEnrollment', () => {
  const build = (
    profile: any,
    opts: { currentBranch?: string | null; samples?: any[] } = {},
  ) => {
    const profileRepo = { findOne: jest.fn().mockResolvedValue(profile) };
    const sampleRepo = {
      find: jest.fn().mockResolvedValue(opts.samples ?? []),
    };
    const auditInTx = { save: jest.fn().mockResolvedValue({}) };
    const em = {
      delete: jest.fn().mockResolvedValue({}),
      getRepository: jest.fn().mockReturnValue(auditInTx),
    };
    const dataSource = {
      // Roster-branch lookup for a branch-scoped caller.
      query: jest
        .fn()
        .mockResolvedValue(
          'currentBranch' in opts ? [{ branchId: opts.currentBranch }] : [],
        ),
      transaction: jest.fn(async (cb: any) => cb(em)),
    };
    const photoStorage = { deletePhoto: jest.fn().mockResolvedValue(true) };
    const azureFace = {
      enabled: false,
      removeEnrollmentFace: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FaceDeskEnrollmentService(
      profileRepo as any,
      sampleRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      azureFace as any,
      photoStorage as any,
      dataSource as any,
    );
    return {
      service,
      profileRepo,
      sampleRepo,
      em,
      auditInTx,
      dataSource,
      photoStorage,
    };
  };

  const profile = {
    profileId: 'p1',
    employeeId: 'e1',
    clientId: 'c1',
    subjectType: 'EMPLOYEE',
    branchId: 'b1',
  };

  it('deletes samples + profile + audit atomically and cleans up photos', async () => {
    const { service, em, auditInTx, dataSource, photoStorage } = build(
      profile,
      {
        currentBranch: 'b1',
        samples: [{ imagePath: 's3://face/a.jpg' }, { imagePath: null }],
      },
    );
    const res = await service.deleteEnrollment(
      'c1',
      'actor',
      'e1',
      'EMPLOYEE',
      ['b1'],
    );
    expect(res).toEqual({ ok: true });
    // All three writes run inside one transaction.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(em.delete).toHaveBeenCalledWith(expect.anything(), {
      profileId: 'p1',
    });
    expect(em.delete).toHaveBeenCalledTimes(2);
    expect(auditInTx.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ENROLLMENT_DELETED', entityId: 'e1' }),
    );
    // The one non-null photo URL is deleted from storage.
    expect(photoStorage.deletePhoto).toHaveBeenCalledTimes(1);
    expect(photoStorage.deletePhoto).toHaveBeenCalledWith('s3://face/a.jpg');
  });

  it('authorizes on the CURRENT roster branch, not the stale profile branch', async () => {
    // Profile branch is stale ('old') but the worker now sits in 'b1' — a branch
    // user scoped to 'b1' must be allowed (transfer case).
    const { service, dataSource } = build(
      { ...profile, branchId: 'old' },
      { currentBranch: 'b1' },
    );
    await expect(
      service.deleteEnrollment('c1', 'actor', 'e1', 'EMPLOYEE', ['b1']),
    ).resolves.toEqual({ ok: true });
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('denies a null-branch (admin-enrolled) profile when the roster branch is out of scope', async () => {
    // The P1: profile.branchId is null, so the old guard was skipped and a branch
    // user could delete it. Now the subject's live branch ('bX') decides.
    const { service, dataSource, photoStorage } = build(
      { ...profile, branchId: null },
      { currentBranch: 'bX' },
    );
    await expect(
      service.deleteEnrollment('c1', 'actor', 'e1', 'EMPLOYEE', ['b1']),
    ).rejects.toThrow(/scope/i);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(photoStorage.deletePhoto).not.toHaveBeenCalled();
  });

  it("denies when the subject is not found in the caller's roster scope", async () => {
    const { service, dataSource } = build(profile, { currentBranch: null });
    await expect(
      service.deleteEnrollment('c1', 'actor', 'e1', 'EMPLOYEE', ['b1']),
    ).rejects.toThrow(/scope/i);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('throws when there is no enrollment to delete', async () => {
    const { service } = build(null);
    await expect(
      service.deleteEnrollment('c1', 'actor', 'missing'),
    ).rejects.toThrow(/no enrollment/i);
  });
});
