import { EnrollmentService } from './enrollment.service';

describe('EnrollmentService.listEmployeeEnrollments', () => {
  function makeService(query: jest.Mock) {
    return new EnrollmentService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { query } as any,
    );
  }

  it('lists active employees and left-joins enrollment state by roster branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);

    await service.listEmployeeEnrollments('client-1');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('e.name AS "employeeName"'),
      ['client-1'],
    );
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('FROM (');
    expect(sql).toContain('FROM employees e');
    expect(sql).toContain('LEFT JOIN face_enrollments fe');
    expect(sql).toContain('fe.branch_id IS NOT DISTINCT FROM scoped.branch_id');
    expect(sql).toContain('fe.employee_id IS NOT NULL AS "isEnrolled"');
    expect(sql).not.toContain('e.employee_name');
  });

  it('also includes template rows so transferred or exited employees remain manageable', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);

    await service.listEmployeeEnrollments('client-1');

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('UNION');
    expect(sql).toContain('SELECT fe.employee_id, fe.branch_id');
    expect(sql).toContain('JOIN employees e');
  });

  it('scopes both current employee rows and template rows to user branches', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);

    await service.listEmployeeEnrollments('client-1', ['branch-1', 'branch-2']);

    const sql = query.mock.calls[0][0] as string;
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('e.branch_id = ANY($2::uuid[])'),
      ['client-1', ['branch-1', 'branch-2']],
    );
    expect(sql).toContain('fe.branch_id = ANY($2::uuid[])');
  });
});
