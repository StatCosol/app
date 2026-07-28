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
