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
    const manager = {
      getRepository: jest.fn(() => punchRepo),
      query: jest.fn(async () => [{ employee_code: 'E001' }]),
    };
    const dataSource = {
      query: jest.fn(),
      transaction: jest.fn(async (cb: (m: typeof manager) => Promise<void>) =>
        cb(manager),
      ),
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
      manager,
    };
  };

  it('approves a pending employee punch and mirrors attendance', async () => {
    const punchTime = new Date('2026-08-09T12:30:00.000Z');
    const { service, punchRepo, directionService } = makeService();
    punchRepo.findOne.mockResolvedValue({
      id: 'punch-1',
      clientId: 'client-1',
      employeeId: 'employee-1',
      branchId: 'branch-1',
      deviceId: 'device-1',
      punchTime,
      decision: 'REVIEW_PENDING',
      reviewNote: 'borderline',
    });

    const result = await service.reviewPunch(
      'client-1',
      'EMPLOYEE',
      'punch-1',
      'APPROVE',
      'admin-1',
      'looks ok',
    );

    expect(result).toEqual({ ok: true, decision: 'REVIEW_APPROVED' });
    expect(directionService.resolveNextPunchDirection).toHaveBeenCalledWith(
      'client-1',
      'EMPLOYEE',
      'employee-1',
      punchTime,
      { endExclusive: punchTime },
    );
    expect(directionService.mirrorEmployeePunchToDailyAttendance).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        branchId: 'branch-1',
        employeeCode: 'E001',
        direction: 'OUT',
        source: 'MOBILE_KIOSK',
      }),
      expect.anything(),
    );
    expect(punchRepo.update).toHaveBeenCalledWith(
      { id: 'punch-1' },
      expect.objectContaining({
        decision: 'REVIEW_APPROVED',
        direction: 'OUT',
        reviewedBy: 'admin-1',
      }),
    );
  });

  it('rejects a pending employee punch without mirroring attendance', async () => {
    const { service, punchRepo, directionService } = makeService();
    punchRepo.findOne.mockResolvedValue({
      id: 'punch-1',
      clientId: 'client-1',
      employeeId: 'employee-1',
      branchId: 'branch-1',
      deviceId: 'device-1',
      punchTime: new Date(),
      decision: 'REVIEW_PENDING',
    });

    const result = await service.reviewPunch(
      'client-1',
      'EMPLOYEE',
      'punch-1',
      'REJECT',
      'admin-1',
    );

    expect(result).toEqual({ ok: true, decision: 'REVIEW_REJECTED' });
    expect(directionService.mirrorEmployeePunchToDailyAttendance).not.toHaveBeenCalled();
  });

  it('refuses to review a punch that is not pending', async () => {
    const { service, punchRepo } = makeService();
    punchRepo.findOne.mockResolvedValue({
      id: 'punch-1',
      clientId: 'client-1',
      decision: 'ACCEPTED',
    });

    await expect(
      service.reviewPunch(
        'client-1',
        'EMPLOYEE',
        'punch-1',
        'APPROVE',
        'admin-1',
      ),
    ).rejects.toThrow('not pending review');
  });
});
