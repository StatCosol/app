import { FaceDeskAdminService } from './facedesk-admin.service';

function makeService() {
  const dupeRepo = {
    manager: { query: jest.fn().mockResolvedValue([]) },
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const reviewRepo = {
    manager: { query: jest.fn().mockResolvedValue([]) },
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const attRepo = {
    update: jest.fn(),
    manager: { query: jest.fn().mockResolvedValue([]) },
  };
  const contractorPunchRepo = { update: jest.fn() };
  const profileRepo = {
    findOne: jest
      .fn()
      .mockResolvedValue({ profileId: 'p1', embeddingModel: 'mobilefacenet' }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
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
      .mockResolvedValue({
        buffer: Buffer.from('img'),
        contentType: 'image/jpeg',
      }),
  };
  const biometric = {
    ingest: jest.fn().mockResolvedValue({ received: 1, inserted: 1 }),
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
    biometric as any,
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
    biometric,
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
    // Photo availability comes from the samples table (profiles has no photo
    // column) — must not reference a non-existent np.photo_url / mp.photo_url.
    expect(sql).toContain('facedesk_employee_face_samples s');
    expect(sql).toContain('s.image_path IS NOT NULL');
    expect(sql).not.toContain('photo_url');
    // Photo flags must require ENROLLED so the "View face" link matches what the
    // enrolled-photo endpoint can serve (blocked/new duplicates would 404).
    // The NEW side is the capture under review and is held as BLOCKED until
    // the admin decides, so it must be viewable in both states — otherwise the
    // alert has to be resolved without seeing the face that raised it.
    expect(sql).toContain("np.enrollment_status IN ('ENROLLED', 'BLOCKED')");
    // The MATCHED side is an existing enrollment; still ENROLLED-only.
    expect(sql).toContain("mp.enrollment_status = 'ENROLLED'");
    expect(params).toEqual(['client-1', 'PENDING']);
  });

  it('scopes duplicate alerts to a branch verifier’s branches', async () => {
    const { service, dupeRepo } = makeService();

    await service.listDuplicateAlerts('client-1', 'PENDING', ['branch-1']);

    const [sql, params] = dupeRepo.manager.query.mock.calls[0];
    expect(sql).toContain('= ANY($3::uuid[])');
    expect(params).toEqual(['client-1', 'PENDING', ['branch-1']]);
  });

  it('returns nothing when the branch scope is empty', async () => {
    const { service, dupeRepo } = makeService();

    const res = await service.listDuplicateAlerts('client-1', 'PENDING', []);

    expect(res).toEqual([]);
    expect(dupeRepo.manager.query).not.toHaveBeenCalled();
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

  it('ingests an approved employee punch into daily attendance', async () => {
    const { service, reviewRepo, attRepo, biometric } = makeService();
    reviewRepo.findOne.mockResolvedValue({
      reviewId: 'review-1',
      clientId: 'client-1',
      branchId: 'branch-1',
      employeeId: 'emp-1',
      attendanceId: 'att-1',
      contractorPunchId: null,
      issueType: 'FACE_MISMATCH',
      status: 'PENDING',
      probeEmbedding: null,
    });
    attRepo.manager.query.mockResolvedValueOnce([
      {
        employeeCode: 'E001',
        punchTime: new Date('2026-08-01T03:30:00.000Z'),
        punchType: 'IN',
        deviceId: 'device-1',
        branchId: 'branch-1',
      },
    ]);

    await service.actOnReview(
      'client-1',
      'review-1',
      'reviewer-1',
      { action: 'APPROVE' },
      ['branch-1'],
    );

    expect(biometric.ingest).toHaveBeenCalledWith(
      'client-1',
      [
        expect.objectContaining({
          employeeCode: 'E001',
          direction: 'IN',
          source: 'MOBILE_KIOSK',
        }),
      ],
      true,
    );
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
    expect(res).toEqual(expect.objectContaining({ contentType: 'image/jpeg' }));
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

  it('denies a branch user with no assigned branches (empty scope)', async () => {
    const { service, reviewRepo, photoStorage } = makeService();
    reviewRepo.manager.query.mockResolvedValueOnce([
      { branchId: 'b1', photoUrl: '/uploads/face-photos/x.jpg' },
    ]);
    await expect(
      service.getReviewPhoto('client-1', 'review-1', []),
    ).rejects.toThrow(/not found/i);
    expect(photoStorage.readPhoto).not.toHaveBeenCalled();
  });

  it('denies a null-branch item for a branch-scoped caller', async () => {
    const { service, reviewRepo, photoStorage } = makeService();
    reviewRepo.manager.query.mockResolvedValueOnce([
      { branchId: null, photoUrl: '/uploads/face-photos/x.jpg' },
    ]);
    await expect(
      service.getReviewPhoto('client-1', 'review-1', ['b1']),
    ).rejects.toThrow(/not found/i);
    expect(photoStorage.readPhoto).not.toHaveBeenCalled();
  });
});

describe('FaceDeskAdminService.getReviewEnrollmentPhoto', () => {
  it('streams the enrolled sample for an in-scope review item', async () => {
    const { service, reviewRepo, photoStorage } = makeService();
    reviewRepo.manager.query.mockResolvedValueOnce([
      { branchId: 'b1', photoUrl: '/uploads/face-photos/enrolled.jpg' },
    ]);
    const res = await service.getReviewEnrollmentPhoto('client-1', 'review-1', [
      'b1',
    ]);
    expect(photoStorage.readPhoto).toHaveBeenCalledWith(
      '/uploads/face-photos/enrolled.jpg',
    );
    expect(res).toEqual(expect.objectContaining({ contentType: 'image/jpeg' }));
  });

  it('denies an enrolled sample outside the caller branch scope', async () => {
    const { service, reviewRepo, photoStorage } = makeService();
    reviewRepo.manager.query.mockResolvedValueOnce([
      { branchId: 'b1', photoUrl: '/uploads/face-photos/enrolled.jpg' },
    ]);
    await expect(
      service.getReviewEnrollmentPhoto('client-1', 'review-1', ['b2']),
    ).rejects.toThrow(/not found/i);
    expect(photoStorage.readPhoto).not.toHaveBeenCalled();
  });

  it('returns null if the enrollment has no retained image', async () => {
    const { service, reviewRepo } = makeService();
    reviewRepo.manager.query.mockResolvedValueOnce([
      { branchId: 'b1', photoUrl: null },
    ]);
    await expect(
      service.getReviewEnrollmentPhoto('client-1', 'review-1', null),
    ).resolves.toBeNull();
  });
});

describe('FaceDeskAdminService short-day reviews', () => {
  it('lists short days with the full-day threshold and branch scope', async () => {
    const { service, attRepo } = makeService();
    await service.listShortDayReviews('client-1', { branchIds: ['b1'] });
    const [sql, params] = attRepo.manager.query.mock.calls[0];
    expect(sql).toContain("(a.punch_time AT TIME ZONE 'Asia/Kolkata')::date");
    expect(sql).toContain('d.worked_seconds <');
    expect(sql).toContain('dr.id IS NULL');
    // client, from, to, branchIds, threshold-seconds (540*60)
    expect(params[0]).toBe('client-1');
    expect(params).toContain(540 * 60);
    expect(params).toContainEqual(['b1']);
  });

  it('short-circuits to empty when the branch scope is empty', async () => {
    const { service, attRepo } = makeService();
    const res = await service.listShortDayReviews('client-1', { branchIds: [] });
    expect(res).toEqual([]);
    expect(attRepo.manager.query).not.toHaveBeenCalled();
  });

  const aggRow = (workedSeconds: number, branchId: string | null) => ({
    workedSeconds,
    branchId,
    punches: 4,
    firstIn: new Date('2026-08-20T04:00:00Z'),
    lastOut: new Date('2026-08-20T10:00:00Z'),
    employeeCode: 'E-1',
  });

  it('approves a short day: upserts APPROVED, marks attendance PRESENT, audits', async () => {
    const { service, attRepo, auditRepo } = makeService();
    attRepo.manager.query
      .mockResolvedValueOnce([aggRow(6 * 3600, 'b1')]) // agg
      .mockResolvedValueOnce([]) // day_reviews upsert
      .mockResolvedValueOnce([{ id: 'att-1' }]); // attendance UPDATE hits a row
    const res = await service.actOnDayReview(
      'client-1',
      'actor-1',
      { employeeId: 'emp-1', workDate: '2026-08-20', action: 'FULL_DAY' },
      null,
    );
    expect(res).toEqual({ ok: true, decision: 'APPROVED' });
    const upsertCall = attRepo.manager.query.mock.calls[1];
    expect(upsertCall[0]).toContain('INSERT INTO facedesk_day_reviews');
    expect(upsertCall[1]).toEqual(
      expect.arrayContaining(['client-1', 'emp-1', 'b1', '2026-08-20', 360, 'APPROVED', 'actor-1']),
    );
    // Attendance is updated to a full present day, approved, locked as MANUAL.
    const attCall = attRepo.manager.query.mock.calls[2];
    expect(attCall[0]).toContain('UPDATE attendance_records');
    expect(attCall[0]).toContain("source = 'MANUAL'");
    expect(attCall[1]).toEqual(
      expect.arrayContaining(['client-1', 'emp-1', '2026-08-20', 'PRESENT', 'APPROVED', 'actor-1']),
    );
    expect(auditRepo.save).toHaveBeenCalled();
  });

  it('records a half day: attendance HALF_DAY / APPROVED', async () => {
    const { service, attRepo } = makeService();
    attRepo.manager.query
      .mockResolvedValueOnce([aggRow(5 * 3600, 'b1')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'att-1' }]);
    const res = await service.actOnDayReview(
      'client-1',
      'actor-1',
      { employeeId: 'emp-1', workDate: '2026-08-20', action: 'HALF_DAY' },
      null,
    );
    expect(res).toEqual({ ok: true, decision: 'HALF_DAY' });
    const attCall = attRepo.manager.query.mock.calls[2];
    expect(attCall[1]).toEqual(
      expect.arrayContaining(['2026-08-20', 'HALF_DAY', 'APPROVED']),
    );
  });

  it('rejects a short day: attendance ABSENT / REJECTED, inserts if no row', async () => {
    const { service, attRepo } = makeService();
    attRepo.manager.query
      .mockResolvedValueOnce([aggRow(4 * 3600, 'b1')])
      .mockResolvedValueOnce([]) // day_reviews upsert
      .mockResolvedValueOnce([]) // attendance UPDATE hits nothing
      .mockResolvedValueOnce([]); // attendance INSERT fallback
    const res = await service.actOnDayReview(
      'client-1',
      'actor-1',
      { employeeId: 'emp-1', workDate: '2026-08-20', action: 'REJECT', remarks: 'too short' },
      null,
    );
    expect(res).toEqual({ ok: true, decision: 'REJECTED' });
    const updCall = attRepo.manager.query.mock.calls[2];
    expect(updCall[0]).toContain('UPDATE attendance_records');
    expect(updCall[1]).toEqual(expect.arrayContaining(['ABSENT', 'REJECTED', 'too short']));
    const insCall = attRepo.manager.query.mock.calls[3];
    expect(insCall[0]).toContain('INSERT INTO attendance_records');
    expect(insCall[1]).toEqual(expect.arrayContaining(['ABSENT', 'REJECTED']));
  });

  it('rejects a branch user acting outside their branch', async () => {
    const { service, attRepo } = makeService();
    attRepo.manager.query.mockResolvedValueOnce([
      { workedSeconds: 6 * 3600, branchId: 'b-other', punches: 2 },
    ]);
    await expect(
      service.actOnDayReview(
        'client-1',
        'actor-1',
        { employeeId: 'emp-1', workDate: '2026-08-20', action: 'FULL_DAY' },
        ['b1'],
      ),
    ).rejects.toThrow();
  });

  it('refuses to review a day that already meets full-day hours', async () => {
    const { service, attRepo } = makeService();
    attRepo.manager.query.mockResolvedValueOnce([
      { workedSeconds: 9.5 * 3600, branchId: 'b1', punches: 2 },
    ]);
    await expect(
      service.actOnDayReview(
        'client-1',
        'actor-1',
        { employeeId: 'emp-1', workDate: '2026-08-20', action: 'FULL_DAY' },
        null,
      ),
    ).rejects.toThrow(/full-day/);
  });

  it('404s when there are no punches for that employee/day', async () => {
    const { service, attRepo } = makeService();
    attRepo.manager.query.mockResolvedValueOnce([
      { workedSeconds: 0, branchId: null, punches: 0 },
    ]);
    await expect(
      service.actOnDayReview(
        'client-1',
        'actor-1',
        { employeeId: 'emp-1', workDate: '2026-08-20', action: 'REJECT' },
        null,
      ),
    ).rejects.toThrow();
  });
});

describe('FaceDeskAdminService.actOnDuplicate — resolution by detection band', () => {
  function alert(detectionBand: 'BLOCK' | 'REVIEW') {
    return {
      alertId: 'a1',
      clientId: 'c1',
      newEmployeeId: 'emp-new',
      matchedEmployeeId: 'emp-old',
      status: 'PENDING',
      detectionBand,
    };
  }

  // REVIEW alerts are raised AFTER the profile is already ENROLLED with a
  // valid template, so clearing one must not tear that enrollment down.
  it('REVIEW + FALSE_ALERT leaves the enrollment intact', async () => {
    const { service, dupeRepo, profileRepo } = makeService();
    dupeRepo.findOne.mockResolvedValue(alert('REVIEW'));

    await service.actOnDuplicate('c1', 'a1', 'admin', {
      action: 'FALSE_ALERT',
    } as any);

    const [, patch] = profileRepo.update.mock.calls[0];
    expect(patch).toEqual({ duplicateStatus: 'CLEAR' });
    expect(patch.enrollmentStatus).toBeUndefined();
  });

  // The whole point of the review band: confirming the duplicate must stop it
  // being usable. Leaving it ENROLLED would let a confirmed duplicate punch.
  it('REVIEW + REJECT revokes the enrollment', async () => {
    const { service, dupeRepo, profileRepo } = makeService();
    dupeRepo.findOne.mockResolvedValue(alert('REVIEW'));

    await service.actOnDuplicate('c1', 'a1', 'admin', {
      action: 'REJECT',
    } as any);

    const [, patch] = profileRepo.update.mock.calls[0];
    expect(patch).toEqual({
      duplicateStatus: 'FLAGGED',
      enrollmentStatus: 'BLOCKED',
    });
  });

  // The capture that raised the alert is now kept against a BLOCKED profile,
  // so approving it completes the enrollment — the worker does not go back to
  // the kiosk to be photographed again.
  it('BLOCK + APPROVE enrolls when the held capture is present', async () => {
    const { service, dupeRepo, profileRepo } = makeService();
    dupeRepo.findOne.mockResolvedValue(alert('BLOCK'));
    profileRepo.findOne.mockResolvedValue({
      profileId: 'p1',
      faceTemplate: Buffer.from(new Float32Array([1, 0, 0, 0]).buffer),
    });

    await service.actOnDuplicate('c1', 'a1', 'admin', {
      action: 'APPROVE',
    } as any);

    const [, patch] = profileRepo.update.mock.calls[0];
    expect(patch).toEqual({
      duplicateStatus: 'APPROVED',
      enrollmentStatus: 'ENROLLED',
    });
  });

  // Alerts raised before captures were retained have no template to activate,
  // so those must still fall back to re-enrollment rather than enrolling an
  // empty profile.
  it('BLOCK + APPROVE falls back to PENDING when no capture was kept', async () => {
    const { service, dupeRepo, profileRepo } = makeService();
    dupeRepo.findOne.mockResolvedValue(alert('BLOCK'));
    profileRepo.findOne.mockResolvedValue({ profileId: 'p1' });

    await service.actOnDuplicate('c1', 'a1', 'admin', {
      action: 'APPROVE',
    } as any);

    const [, patch] = profileRepo.update.mock.calls[0];
    expect(patch).toEqual({
      duplicateStatus: 'APPROVED',
      enrollmentStatus: 'PENDING',
    });
  });

  // Refused face: the profile row stays for the audit trail, but the biometric
  // data captured for it must not be retained.
  it('BLOCK + REJECT shreds the held template and samples', async () => {
    const { service, dupeRepo, profileRepo, sampleRepo } = makeService();
    dupeRepo.findOne.mockResolvedValue(alert('BLOCK'));
    profileRepo.findOne.mockResolvedValue({
      profileId: 'p1',
      faceTemplate: Buffer.from(new Float32Array([1, 0, 0, 0]).buffer),
    });

    await service.actOnDuplicate('c1', 'a1', 'admin', {
      action: 'REJECT',
    } as any);

    expect(sampleRepo.delete).toHaveBeenCalledWith({ profileId: 'p1' });
    const [, patch] = profileRepo.update.mock.calls[0];
    expect(patch.faceTemplate).toBeNull();
    expect(patch.enrollmentStatus).toBe('BLOCKED');
  });
});
