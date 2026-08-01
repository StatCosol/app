import { FaceDeskAdminService } from './facedesk-admin.service';

function makeService() {
  const dupeRepo = {
    manager: { query: jest.fn().mockResolvedValue([]) },
  };
  const reviewRepo = {
    manager: { query: jest.fn().mockResolvedValue([]) },
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const attRepo = { update: jest.fn() };
  const contractorPunchRepo = { update: jest.fn() };
  const profileRepo = {
    findOne: jest.fn().mockResolvedValue({ profileId: 'p1', embeddingModel: 'mobilefacenet' }),
  };
  const sampleRepo = {
    save: jest.fn().mockResolvedValue({}),
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({}),
  };
  const correctionRepo = {};
  const auditRepo = { save: jest.fn().mockResolvedValue({}) };
  const photoStorage = {
    readPhoto: jest
      .fn()
      .mockResolvedValue({ buffer: Buffer.from('img'), contentType: 'image/jpeg' }),
  };
  const service = new FaceDeskAdminService(
    dupeRepo as any,
    reviewRepo as any,
    attRepo as any,
    contractorPunchRepo as any,
    profileRepo as any,
    sampleRepo as any,
    correctionRepo as any,
    auditRepo as any,
    photoStorage as any,
  );
  return {
    service,
    dupeRepo,
    reviewRepo,
    attRepo,
    contractorPunchRepo,
    sampleRepo,
    profileRepo,
    auditRepo,
    photoStorage,
  };
}

describe('FaceDeskAdminService contractor review flow', () => {
  it('enriches duplicate alerts with both workers and subject types', async () => {
    const { service, dupeRepo } = makeService();

    await service.listDuplicateAlerts('client-1');

    const [sql, params] = dupeRepo.manager.query.mock.calls[0];
    expect(sql).toContain('COALESCE(ne.name, nc.name) AS "newEmployeeName"');
    expect(sql).toContain(
      'COALESCE(me.name, mc.name) AS "matchedEmployeeName"',
    );
    expect(sql).toContain(
      `np.subject_type = 'CONTRACTOR' AND nc.id = da.new_employee_id`,
    );
    expect(params).toEqual(['client-1', 'PENDING']);
  });

  it('lists contractor mismatches through the FaceDesk review query', async () => {
    const { service, reviewRepo } = makeService();

    await service.listReviewQueue('client-1');

    const sql = reviewRepo.manager.query.mock.calls[0][0];
    expect(sql).toContain('rq.contractor_punch_id AS "contractorPunchId"');
    expect(sql).toContain(
      'LEFT JOIN contractor_biometric_punches cp ON cp.id = rq.contractor_punch_id',
    );
    expect(sql).toContain(
      'LEFT JOIN contractor_employees ce ON ce.id = cp.contractor_employee_id',
    );
  });

  it('approves a contractor mismatch as REVIEW_APPROVED', async () => {
    const { service, reviewRepo, contractorPunchRepo, attRepo } = makeService();
    reviewRepo.findOne.mockResolvedValue({
      reviewId: 'review-1',
      clientId: 'client-1',
      branchId: 'branch-1',
      employeeId: 'contractor-employee-1',
      attendanceId: null,
      contractorPunchId: 'contractor-punch-1',
      issueType: 'FACE_MISMATCH',
      status: 'PENDING',
    });

    const result = await service.actOnReview(
      'client-1',
      'review-1',
      'reviewer-1',
      { action: 'APPROVE', remarks: 'Face confirmed' },
      ['branch-1'],
    );

    expect(result).toEqual({ ok: true, status: 'APPROVED' });
    expect(contractorPunchRepo.update).toHaveBeenCalledWith(
      { id: 'contractor-punch-1', clientId: 'client-1' },
      expect.objectContaining({
        decision: 'REVIEW_APPROVED',
        reviewedBy: 'reviewer-1',
        reviewNote: 'Face confirmed',
      }),
    );
    expect(attRepo.update).not.toHaveBeenCalled();
  });

  it('folds the approved face into the gallery (point 4)', async () => {
    const { service, reviewRepo, sampleRepo } = makeService();
    reviewRepo.findOne.mockResolvedValue({
      reviewId: 'review-1',
      clientId: 'client-1',
      branchId: 'branch-1',
      employeeId: 'emp-1',
      attendanceId: 'att-1',
      contractorPunchId: null,
      issueType: 'FACE_MISMATCH',
      status: 'PENDING',
      probeEmbedding: Buffer.from(new Float32Array([1, 0, 0, 0]).buffer),
    });

    await service.actOnReview(
      'client-1',
      'review-1',
      'reviewer-1',
      { action: 'APPROVE' },
      ['branch-1'],
    );

    // The captured face is added to the subject's gallery as an EXPRESSION sample.
    expect(sampleRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'emp-1',
        profileId: 'p1',
        sampleType: 'EXPRESSION',
      }),
    );
  });

  it('does NOT add to the gallery on reject', async () => {
    const { service, reviewRepo, sampleRepo } = makeService();
    reviewRepo.findOne.mockResolvedValue({
      reviewId: 'review-1',
      clientId: 'client-1',
      branchId: 'branch-1',
      employeeId: 'emp-1',
      attendanceId: 'att-1',
      contractorPunchId: null,
      issueType: 'FACE_MISMATCH',
      status: 'PENDING',
      probeEmbedding: Buffer.from(new Float32Array([1, 0, 0, 0]).buffer),
    });

    await service.actOnReview(
      'client-1',
      'review-1',
      'reviewer-1',
      { action: 'REJECT' },
      ['branch-1'],
    );

    expect(sampleRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a contractor mismatch as REVIEW_REJECTED', async () => {
    const { service, reviewRepo, contractorPunchRepo } = makeService();
    reviewRepo.findOne.mockResolvedValue({
      reviewId: 'review-1',
      clientId: 'client-1',
      branchId: 'branch-1',
      attendanceId: null,
      contractorPunchId: 'contractor-punch-1',
      issueType: 'FACE_MISMATCH',
      status: 'PENDING',
    });

    await service.actOnReview(
      'client-1',
      'review-1',
      'reviewer-1',
      { action: 'REJECT' },
      ['branch-1'],
    );

    expect(contractorPunchRepo.update).toHaveBeenCalledWith(
      { id: 'contractor-punch-1', clientId: 'client-1' },
      expect.objectContaining({
        decision: 'REVIEW_REJECTED',
        reviewedBy: 'reviewer-1',
      }),
    );
  });
});

describe('FaceDeskAdminService.getReviewPhoto', () => {
  it('streams the review photo for an in-scope item', async () => {
    const { service, reviewRepo, photoStorage } = makeService();
    reviewRepo.manager.query.mockResolvedValueOnce([
      { branchId: 'b1', photoUrl: '/uploads/face-photos/x.jpg' },
    ]);
    const res = await service.getReviewPhoto('client-1', 'review-1', ['b1']);
    expect(photoStorage.readPhoto).toHaveBeenCalledWith(
      '/uploads/face-photos/x.jpg',
    );
    expect(res).toEqual(
      expect.objectContaining({ contentType: 'image/jpeg' }),
    );
  });

  it('denies a review item outside the branch scope', async () => {
    const { service, reviewRepo, photoStorage } = makeService();
    reviewRepo.manager.query.mockResolvedValueOnce([
      { branchId: 'b1', photoUrl: '/uploads/face-photos/x.jpg' },
    ]);
    await expect(
      service.getReviewPhoto('client-1', 'review-1', ['b2']),
    ).rejects.toThrow(/not found/i);
    expect(photoStorage.readPhoto).not.toHaveBeenCalled();
  });

  it('throws when the review item does not exist', async () => {
    const { service, reviewRepo } = makeService();
    reviewRepo.manager.query.mockResolvedValueOnce([]);
    await expect(
      service.getReviewPhoto('client-1', 'missing', null),
    ).rejects.toThrow(/not found/i);
  });

  it('returns null when the item has no photo', async () => {
    const { service, reviewRepo } = makeService();
    reviewRepo.manager.query.mockResolvedValueOnce([
      { branchId: 'b1', photoUrl: null },
    ]);
    await expect(
      service.getReviewPhoto('client-1', 'review-1', null),
    ).resolves.toBeNull();
  });
});
