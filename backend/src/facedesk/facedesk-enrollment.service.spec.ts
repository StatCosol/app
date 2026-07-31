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
    {} as any,
    dataSource as any,
  );
  return { service, dataSource };
}

describe('FaceDeskEnrollmentService enrolled roster', () => {
  it('returns no rows for a branch user with no assigned branches', async () => {
    const { service, dataSource } = makeService();

    await expect(
      service.getEnrolledEmployees('client-1', [], 'EMPLOYEE'),
    ).resolves.toEqual([]);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('returns employee identity and enrollment health within branch scope', async () => {
    const { service, dataSource } = makeService();

    await service.getEnrolledEmployees(
      'client-1',
      ['branch-1'],
      'EMPLOYEE',
    );

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

describe('FaceDeskEnrollmentService deleteEnrollment', () => {
  const build = (profile: any) => {
    const profileRepo = {
      findOne: jest.fn().mockResolvedValue(profile),
      delete: jest.fn().mockResolvedValue({}),
    };
    const sampleRepo = { delete: jest.fn().mockResolvedValue({}) };
    const auditRepo = { save: jest.fn().mockResolvedValue({}) };
    const service = new FaceDeskEnrollmentService(
      profileRepo as any,
      sampleRepo as any,
      {} as any,
      {} as any,
      auditRepo as any,
      {} as any,
      {} as any,
      {} as any,
      { query: jest.fn() } as any,
    );
    return { service, profileRepo, sampleRepo, auditRepo };
  };

  it('deletes the samples then the profile and writes an audit', async () => {
    const { service, profileRepo, sampleRepo, auditRepo } = build({
      profileId: 'p1',
      employeeId: 'e1',
      clientId: 'c1',
      subjectType: 'EMPLOYEE',
      branchId: 'b1',
    });
    const res = await service.deleteEnrollment('c1', 'actor', 'e1', 'EMPLOYEE', [
      'b1',
    ]);
    expect(res).toEqual({ ok: true });
    expect(sampleRepo.delete).toHaveBeenCalledWith({ profileId: 'p1' });
    expect(profileRepo.delete).toHaveBeenCalledWith({ profileId: 'p1' });
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ENROLLMENT_DELETED', entityId: 'e1' }),
    );
  });

  it('refuses to delete an enrollment outside the branch scope', async () => {
    const { service, profileRepo, sampleRepo } = build({
      profileId: 'p1',
      branchId: 'b1',
    });
    await expect(
      service.deleteEnrollment('c1', 'actor', 'e1', 'EMPLOYEE', ['b2']),
    ).rejects.toThrow(/scope/i);
    expect(sampleRepo.delete).not.toHaveBeenCalled();
    expect(profileRepo.delete).not.toHaveBeenCalled();
  });

  it('throws when there is no enrollment to delete', async () => {
    const { service } = build(null);
    await expect(
      service.deleteEnrollment('c1', 'actor', 'missing'),
    ).rejects.toThrow(/no enrollment/i);
  });
});
