import { ForbiddenException } from '@nestjs/common';
import { MobileAttendanceEnrollmentController } from './mobile-attendance.controller';

describe('MobileAttendanceEnrollmentController.selfEnroll', () => {
  it('blocks employee callers from enrolling a contractor employee', () => {
    const enrollmentService = {
      enrollContractorSelf: jest.fn(),
    };
    const controller = new MobileAttendanceEnrollmentController(
      enrollmentService as any,
      {} as any,
    );

    expect(() =>
      controller.selfEnroll(
        {
          clientId: 'client-1',
          userId: 'user-1',
          employeeId: 'employee-1',
          roleCode: 'EMPLOYEE',
        } as any,
        {
          subjectType: 'CONTRACTOR',
          contractorEmployeeId: 'contractor-employee-1',
        } as any,
      ),
    ).toThrow(ForbiddenException);
    expect(enrollmentService.enrollContractorSelf).not.toHaveBeenCalled();
  });

  it('allows client operators to enroll a contractor employee', () => {
    const enrollmentService = {
      enrollContractorSelf: jest.fn().mockReturnValue({ id: 'enrollment-1' }),
    };
    const controller = new MobileAttendanceEnrollmentController(
      enrollmentService as any,
      {} as any,
    );

    expect(
      controller.selfEnroll(
        {
          clientId: 'client-1',
          userId: 'user-1',
          roleCode: 'CLIENT',
          branchIds: ['branch-1'],
        } as any,
        {
          subjectType: 'CONTRACTOR',
          contractorEmployeeId: 'contractor-employee-1',
        } as any,
      ),
    ).toEqual({ id: 'enrollment-1' });
    expect(enrollmentService.enrollContractorSelf).toHaveBeenCalledWith(
      'contractor-employee-1',
      'client-1',
      'branch-1',
      expect.any(Object),
      'user-1',
    );
  });
});
