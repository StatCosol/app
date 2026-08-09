import { FaceEnrollmentFederationService } from './face-enrollment-federation.service';

describe('FaceEnrollmentFederationService', () => {
  const makeService = () => {
    const dataSource = { query: jest.fn() };
    const service = new FaceEnrollmentFederationService(dataSource as any);
    return { service, dataSource };
  };

  it('merges mobile and facedesk enrollment state per employee', async () => {
    const { service, dataSource } = makeService();
    dataSource.query.mockResolvedValueOnce([
      {
        employeeId: 'emp-1',
        employeeCode: 'E001',
        employeeName: 'Alice',
        branchId: 'branch-1',
        mobileIsEnrolled: true,
        mobileIsActive: true,
        mobileEmbeddingModel: 'mobilefacenet',
        mobileEnrolledAt: new Date('2026-08-01T10:00:00.000Z'),
        facedeskStatus: 'PENDING',
        facedeskEnrolledAt: null,
      },
      {
        employeeId: 'emp-2',
        employeeCode: 'E002',
        employeeName: 'Bob',
        branchId: 'branch-1',
        mobileIsEnrolled: false,
        mobileIsActive: false,
        mobileEmbeddingModel: null,
        mobileEnrolledAt: null,
        facedeskStatus: 'ENROLLED',
        facedeskEnrolledAt: new Date('2026-08-02T10:00:00.000Z'),
      },
    ]);

    const result = await service.listFederated('client-1', {
      includeMobile: true,
      includeFacedesk: true,
      limit: 100,
    });

    expect(result.summary).toEqual({
      totalEmployees: 2,
      mobileEnrolledActive: 1,
      facedeskEnrolled: 1,
      bothEnrolled: 0,
      pendingEither: 2,
    });
    expect(result.items[0]).toMatchObject({
      employeeCode: 'E001',
      overallStatus: 'PARTIAL',
      mobile: { isEnrolled: true, isActive: true },
      facedesk: { enrollmentStatus: 'PENDING' },
    });
    expect(result.items[1]).toMatchObject({
      employeeCode: 'E002',
      overallStatus: 'PARTIAL',
    });
    expect(String(dataSource.query.mock.calls[0][0])).toContain(
      'face_enrollments',
    );
    expect(String(dataSource.query.mock.calls[0][0])).toContain(
      'facedesk_employee_face_profiles',
    );
  });

  it('omits mobile joins when includeMobile is false', async () => {
    const { service, dataSource } = makeService();
    dataSource.query.mockResolvedValueOnce([
      {
        employeeId: 'emp-1',
        employeeCode: 'E001',
        employeeName: 'Alice',
        branchId: 'branch-1',
        mobileIsEnrolled: false,
        mobileIsActive: false,
        mobileEmbeddingModel: null,
        mobileEnrolledAt: null,
        facedeskStatus: 'ENROLLED',
        facedeskEnrolledAt: new Date('2026-08-02T10:00:00.000Z'),
      },
    ]);

    const result = await service.listFederated('client-1', {
      includeMobile: false,
      includeFacedesk: true,
    });

    expect(result.items[0]?.mobile).toBeNull();
    expect(result.items[0]?.overallStatus).toBe('FULLY_ENROLLED');
    expect(String(dataSource.query.mock.calls[0][0])).not.toContain(
      'face_enrollments',
    );
  });

  it('returns empty lists for branch users with no assigned branches', async () => {
    const { service, dataSource } = makeService();

    const result = await service.listFederated('client-1', {
      includeMobile: true,
      includeFacedesk: true,
      branchIds: [],
    });

    expect(result.items).toEqual([]);
    expect(result.summary.totalEmployees).toBe(0);
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
