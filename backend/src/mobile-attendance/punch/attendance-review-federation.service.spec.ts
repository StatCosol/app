import { AttendanceReviewFederationService } from './attendance-review-federation.service';

describe('AttendanceReviewFederationService', () => {
  const makeService = () => {
    const punchReview = {
      listReviewPunches: jest.fn(),
    };
    const dataSource = {
      query: jest.fn(),
    };
    const service = new AttendanceReviewFederationService(
      punchReview as any,
      dataSource as any,
    );
    return { service, punchReview, dataSource };
  };

  it('merges mobile and facedesk queues sorted by punch time', async () => {
    const { service, punchReview, dataSource } = makeService();
    punchReview.listReviewPunches.mockResolvedValue([
      {
        id: 'mobile-1',
        subjectType: 'EMPLOYEE',
        subjectName: 'Alice',
        subjectCode: 'E001',
        branchId: 'branch-1',
        punchTime: new Date('2026-08-09T10:00:00.000Z'),
        decision: 'REVIEW_PENDING',
      },
    ]);
    dataSource.query
      .mockResolvedValueOnce([
        {
          reviewId: 'fd-1',
          subjectType: 'EMPLOYEE',
          employeeName: 'Bob',
          employeeCode: 'E002',
          branchId: 'branch-1',
          punchTime: new Date('2026-08-09T12:00:00.000Z'),
          issueType: 'FACE_MISMATCH',
          status: 'PENDING',
        },
      ])
      .mockResolvedValueOnce([{ n: '1' }])
      .mockResolvedValueOnce([{ n: '1' }]);

    const result = await service.listFederated('client-1', {
      includeMobile: true,
      includeFacedesk: true,
      limit: 50,
    });

    expect(result.summary).toEqual({
      mobileBorderlinePending: 1,
      facedeskVerificationPending: 1,
      totalPending: 2,
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      queue: 'FACEDESK_VERIFICATION',
      itemId: 'fd-1',
      portalPath: '/client/facedesk',
    });
    expect(result.items[1]).toMatchObject({
      queue: 'MOBILE_BORDERLINE',
      itemId: 'mobile-1',
      portalPath: '/client/mobile-attendance',
    });
  });

  it('returns only mobile items when FaceDesk is not entitled', async () => {
    const { service, punchReview, dataSource } = makeService();
    punchReview.listReviewPunches.mockResolvedValue([]);
    dataSource.query.mockResolvedValueOnce([{ n: '0' }]);

    const result = await service.listFederated('client-1', {
      includeMobile: true,
      includeFacedesk: false,
    });

    expect(result.summary.facedeskVerificationPending).toBe(0);
    expect(dataSource.query).toHaveBeenCalledTimes(1);
    expect(punchReview.listReviewPunches).toHaveBeenCalled();
  });

  it('returns empty lists for branch users with no assigned branches', async () => {
    const { service, punchReview, dataSource } = makeService();

    const result = await service.listFederated('client-1', {
      includeMobile: true,
      includeFacedesk: true,
      branchIds: [],
    });

    expect(result.items).toEqual([]);
    expect(result.summary.totalPending).toBe(0);
    expect(punchReview.listReviewPunches).not.toHaveBeenCalled();
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
