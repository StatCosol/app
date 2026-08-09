import { AttendanceReviewFederationService } from './attendance-review-federation.service';

describe('AttendanceReviewFederationService', () => {
  const makeService = () => {
    const dataSource = {
      query: jest.fn(),
    };
    const service = new AttendanceReviewFederationService(dataSource as any);
    return { service, dataSource };
  };

  it('returns independent mobile and facedesk item pages', async () => {
    const { service, dataSource } = makeService();
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 'mobile-1',
          subjectType: 'EMPLOYEE',
          subjectName: 'Alice',
          subjectCode: 'E001',
          branchId: 'branch-1',
          punchTime: new Date('2026-08-09T10:00:00.000Z'),
          decision: 'REVIEW_PENDING',
        },
      ])
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
    expect(result.mobileItems).toHaveLength(1);
    expect(result.facedeskItems).toHaveLength(1);
    expect(result.facedeskItems[0]).toMatchObject({
      queue: 'FACEDESK_VERIFICATION',
      itemId: 'fd-1',
    });
    expect(String(dataSource.query.mock.calls[0][0])).toContain(
      'FROM mobile_attendance_punches',
    );
    expect(String(dataSource.query.mock.calls[1][0])).toContain(
      "issue_type = 'FACE_MISMATCH'",
    );
  });

  it('queries employee punches directly instead of the contractor union', async () => {
    const { service, dataSource } = makeService();
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 'mobile-emp',
          subjectType: 'EMPLOYEE',
          subjectName: 'Alice',
          subjectCode: 'E001',
          branchId: 'branch-1',
          punchTime: new Date('2026-08-09T10:00:00.000Z'),
          decision: 'REVIEW_PENDING',
        },
      ])
      .mockResolvedValueOnce([{ n: '1' }]);

    const result = await service.listFederated('client-1', {
      includeMobile: true,
      includeFacedesk: false,
      limit: 50,
    });

    expect(result.mobileItems).toHaveLength(1);
    expect(result.mobileItems[0]?.itemId).toBe('mobile-emp');
    expect(result.summary.mobileBorderlinePending).toBe(1);
    expect(String(dataSource.query.mock.calls[0][0])).not.toContain(
      'contractor_biometric_punches',
    );
  });

  it('preserves facedesk rows when merged items are mobile-heavy', async () => {
    const { service, dataSource } = makeService();
    const mobileRows = Array.from({ length: 50 }, (_, index) => ({
      id: `mobile-${index}`,
      subjectType: 'EMPLOYEE',
      subjectName: `Employee ${index}`,
      subjectCode: `E${index}`,
      branchId: 'branch-1',
      punchTime: new Date(`2026-08-09T${String(10 + (index % 10)).padStart(2, '0')}:00:00.000Z`),
      decision: 'REVIEW_PENDING',
    }));
    dataSource.query
      .mockResolvedValueOnce(mobileRows)
      .mockResolvedValueOnce([
        {
          reviewId: 'fd-old',
          subjectType: 'EMPLOYEE',
          employeeName: 'Verifier',
          employeeCode: 'E999',
          branchId: 'branch-1',
          punchTime: new Date('2026-08-08T08:00:00.000Z'),
          issueType: 'FACE_MISMATCH',
          status: 'PENDING',
        },
      ])
      .mockResolvedValueOnce([{ n: '50' }])
      .mockResolvedValueOnce([{ n: '1' }]);

    const result = await service.listFederated('client-1', {
      includeMobile: true,
      includeFacedesk: true,
      limit: 50,
    });

    expect(result.items.every((item) => item.queue === 'MOBILE_BORDERLINE')).toBe(
      true,
    );
    expect(result.facedeskItems).toHaveLength(1);
    expect(result.facedeskItems[0]?.itemId).toBe('fd-old');
  });

  it('skips mobile queue when includeMobile is false', async () => {
    const { service, dataSource } = makeService();
    dataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ n: '0' }])
      .mockResolvedValueOnce([{ n: '0' }]);

    await service.listFederated('client-1', {
      includeMobile: false,
      includeFacedesk: true,
    });

    expect(String(dataSource.query.mock.calls[0][0])).toContain(
      'facedesk_attendance_review_queue',
    );
    expect(
      dataSource.query.mock.calls.some((call: unknown[]) =>
        String(call[0]).includes('mobile_attendance_punches'),
      ),
    ).toBe(false);
  });

  it('returns empty lists for branch users with no assigned branches', async () => {
    const { service, dataSource } = makeService();

    const result = await service.listFederated('client-1', {
      includeMobile: true,
      includeFacedesk: true,
      branchIds: [],
    });

    expect(result.items).toEqual([]);
    expect(result.mobileItems).toEqual([]);
    expect(result.facedeskItems).toEqual([]);
    expect(result.summary.totalPending).toBe(0);
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
