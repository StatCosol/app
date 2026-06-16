import { EnrollmentService } from './enrollment.service';

describe('EnrollmentService.listEmployeeEnrollments', () => {
  it('uses the employees.name column for the employee display name', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new EnrollmentService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { query } as any,
    );

    await service.listEmployeeEnrollments('client-1');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('e.name AS "employeeName"'),
      ['client-1'],
    );
    expect(query.mock.calls[0][0]).not.toContain('e.employee_name');
  });
});
