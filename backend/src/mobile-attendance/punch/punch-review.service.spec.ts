import { ForbiddenException } from '@nestjs/common';
import { PunchReviewService } from './punch-review.service';

describe('PunchReviewService', () => {
  const makeService = () => {
    const punchRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    const contractorPunchRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    const photoStorage = {
      readPhoto: jest.fn(),
    };
    const directionService = {
      resolveNextPunchDirection: jest.fn(async () => 'OUT' as const),
      mirrorEmployeePunchToDailyAttendance: jest.fn(async () => undefined),
    };
    const dataSource = {
      query: jest.fn(),
      transaction: jest.fn(),
    };

    const service = new PunchReviewService(
      punchRepo as any,
      contractorPunchRepo as any,
      photoStorage as any,
      directionService as any,
      dataSource as any,
    );

    return {
      service,
      punchRepo,
      contractorPunchRepo,
      directionService,
      dataSource,
    };
  };

  it('rejects employee punch review after ESS mobile retirement', async () => {
    const { service, punchRepo } = makeService();

    await expect(
      service.reviewPunch(
        'client-1',
        'EMPLOYEE',
        'punch-1',
        'APPROVE',
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(punchRepo.findOne).not.toHaveBeenCalled();
  });

  it('approves a pending contractor punch', async () => {
    const punchTime = new Date('2026-08-09T12:30:00.000Z');
    const { service, contractorPunchRepo, directionService } = makeService();
    contractorPunchRepo.findOne.mockResolvedValue({
      id: 'punch-1',
      clientId: 'client-1',
      contractorEmployeeId: 'contractor-1',
      branchId: 'branch-1',
      punchTime,
      decision: 'REVIEW_PENDING',
    });

    const result = await service.reviewPunch(
      'client-1',
      'CONTRACTOR',
      'punch-1',
      'APPROVE',
      'admin-1',
    );

    expect(result).toEqual({ ok: true, decision: 'REVIEW_APPROVED' });
    expect(directionService.resolveNextPunchDirection).toHaveBeenCalledWith(
      'client-1',
      'CONTRACTOR',
      'contractor-1',
      punchTime,
      { endExclusive: punchTime },
    );
    expect(contractorPunchRepo.update).toHaveBeenCalled();
  });

  it('lists contractor review punches only', async () => {
    const { service, dataSource } = makeService();
    dataSource.query.mockResolvedValue([]);

    await service.listReviewPunches('client-1');

    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain('contractor_biometric_punches');
    expect(sql).not.toContain('mobile_attendance_punches');
  });
});
