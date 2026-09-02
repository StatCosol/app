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
    readPhoto: jest.fn().mockResolvedValue({
      buffer: Buffer.from('img'),
      contentType: 'image/jpeg',
    }),
  };
  const biometric = {
    ingest: jest.fn().mockResolvedValue({ received: 1, inserted: 1 }),
  };
  const azureFace = {
    enabled: false,
    ensureClientList: jest.fn().mockResolvedValue('sc-list'),
    addFaceToList: jest.fn(),
    trainClientList: jest.fn().mockResolvedValue(undefined),
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
    azureFace as any,
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
    const res = await service.listShortDayReviews('client-1', {
      branchIds: [],
    });
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
      expect.arrayContaining([
        'client-1',
        'emp-1',
        'b1',
        '2026-08-20',
        360,
        'APPROVED',
        'actor-1',
      ]),
    );
    // Attendance is updated to a full present day, approved, locked as MANUAL.
    const attCall = attRepo.manager.query.mock.calls[2];
    expect(attCall[0]).toContain('UPDATE attendance_records');
    expect(attCall[0]).toContain("source = 'MANUAL'");
    expect(attCall[1]).toEqual(
      expect.arrayContaining([
        'client-1',
        'emp-1',
        '2026-08-20',
        'PRESENT',
        'APPROVED',
        'actor-1',
      ]),
    );
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'emp-1',
        detail: expect.objectContaining({
          workDate: '2026-08-20',
          workedMinutes: 360,
          branchId: 'b1',
        }),
      }),
    );
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
      {
        employeeId: 'emp-1',
        workDate: '2026-08-20',
        action: 'REJECT',
        remarks: 'too short',
      },
      null,
    );
    expect(res).toEqual({ ok: true, decision: 'REJECTED' });
    const updCall = attRepo.manager.query.mock.calls[2];
    expect(updCall[0]).toContain('UPDATE attendance_records');
    expect(updCall[1]).toEqual(
      expect.arrayContaining(['ABSENT', 'REJECTED', 'too short']),
    );
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

function chainable(): Record<string, jest.Mock> {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['where', 'andWhere', 'orderBy', 'take']) {
    qb[m] = jest.fn(() => qb);
  }
  return qb;
}

function makeBackfillService(opts: {
  profiles: Array<{ profileId: string; employeeId: string }>;
  sample?: { imagePath: string } | null;
  photo?: { buffer: Buffer; contentType: string } | null;
  enabled?: boolean;
  addFace?: jest.Mock;
  train?: jest.Mock;
}) {
  const profileQb = chainable();
  profileQb.getMany = jest.fn().mockResolvedValue(opts.profiles);
  const sampleQb = chainable();
  sampleQb.getOne = jest.fn().mockResolvedValue(opts.sample ?? null);

  const profileRepo = {
    createQueryBuilder: jest.fn(() => profileQb),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const sampleRepo = { createQueryBuilder: jest.fn(() => sampleQb) };
  const photoStorage = {
    readPhoto: jest.fn().mockResolvedValue(opts.photo ?? null),
  };
  const azureFace = {
    enabled: opts.enabled ?? true,
    ensureClientList: jest.fn().mockResolvedValue('sc-list'),
    addFaceToList: opts.addFace ?? jest.fn().mockResolvedValue('persisted-1'),
    trainClientList: opts.train ?? jest.fn().mockResolvedValue(true),
  };
  const service = new FaceDeskAdminService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    profileRepo as any,
    sampleRepo as any,
    {} as any,
    {} as any,
    photoStorage as any,
    {} as any,
    azureFace as any,
  );
  return { service, profileRepo, photoStorage, azureFace };
}

const PHOTO = { buffer: Buffer.from('jpeg-bytes'), contentType: 'image/jpeg' };

describe('FaceDeskAdminService Azure face list backfill', () => {
  it('refuses to run when Azure identification is disabled', async () => {
    const { service, azureFace } = makeBackfillService({
      profiles: [],
      enabled: false,
    });
    await expect(service.backfillAzureFaceList('c1')).rejects.toThrow(
      /not enabled/i,
    );
    expect(azureFace.addFaceToList).not.toHaveBeenCalled();
  });

  it('registers a face and stores the persisted id against the profile', async () => {
    const { service, profileRepo, azureFace } = makeBackfillService({
      profiles: [{ profileId: 'p1', employeeId: 'e1' }],
      sample: { imagePath: 's3://b/k.jpg' },
      photo: PHOTO,
    });
    const res = await service.backfillAzureFaceList('c1');

    expect(azureFace.addFaceToList).toHaveBeenCalledWith(
      'sc-list',
      'e1',
      PHOTO.buffer.toString('base64'),
    );
    expect(profileRepo.update).toHaveBeenCalledWith(
      { profileId: 'p1' },
      { azurePersistedFaceId: 'persisted-1' },
    );
    expect(res).toMatchObject({ registered: 1, failed: 0, done: true });
    // One train for the batch, never one per face.
    expect(azureFace.trainClientList).toHaveBeenCalledTimes(1);
  });

  it('skips profiles whose photo is gone instead of stalling on them', async () => {
    const { service, profileRepo, azureFace } = makeBackfillService({
      profiles: [{ profileId: 'p1', employeeId: 'e1' }],
      sample: { imagePath: 'local://dead' },
      photo: null,
    });
    const res = await service.backfillAzureFaceList('c1');

    expect(res).toMatchObject({ skippedNoPhoto: 1, registered: 0 });
    expect(azureFace.addFaceToList).not.toHaveBeenCalled();
    expect(profileRepo.update).not.toHaveBeenCalled();
    // Still trains: this is the final page, and training there is what lets
    // a re-run retry a previously failed train.
    expect(azureFace.trainClientList).toHaveBeenCalledTimes(1);
  });

  it('counts an Azure failure and leaves the profile unlinked for a retry', async () => {
    const { service, profileRepo } = makeBackfillService({
      profiles: [{ profileId: 'p1', employeeId: 'e1' }],
      sample: { imagePath: 's3://b/k.jpg' },
      photo: PHOTO,
      addFace: jest.fn().mockRejectedValue(new Error('429 rate limited')),
    });
    const res = await service.backfillAzureFaceList('c1');

    expect(res.failed).toBe(1);
    expect(res.registered).toBe(0);
    expect(res.errors[0]).toContain('429');
    // Still NULL, so the next run picks it up again.
    expect(profileRepo.update).not.toHaveBeenCalled();
  });

  it('returns a cursor when the batch fills, and reports done when it does not', async () => {
    const full = await makeBackfillService({
      profiles: [
        { profileId: 'p1', employeeId: 'e1' },
        { profileId: 'p2', employeeId: 'e2' },
      ],
      sample: { imagePath: 's3://b/k.jpg' },
      photo: PHOTO,
    }).service.backfillAzureFaceList('c1', { limit: 2 });
    expect(full).toMatchObject({ done: false, nextCursor: 'p2' });

    const partial = await makeBackfillService({
      profiles: [{ profileId: 'p1', employeeId: 'e1' }],
      sample: { imagePath: 's3://b/k.jpg' },
      photo: PHOTO,
    }).service.backfillAzureFaceList('c1', { limit: 2 });
    expect(partial).toMatchObject({ done: true, nextCursor: null });
  });
});

describe('FaceDeskAdminService Azure face list backfill status', () => {
  it('returns normalized aggregate-only status for the admin portal', async () => {
    const profileQuery = jest
      .fn()
      .mockResolvedValueOnce([{ exists: 1 }])
      .mockResolvedValueOnce([
        {
          enrolled: 14,
          linked: 3,
          pending: 11,
          storedPhotoCandidates: 9,
          recaptureNeeded: 2,
        },
      ]);
    const auditQuery = jest.fn().mockResolvedValue([{ count: 1 }]);
    const service = new FaceDeskAdminService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { manager: { query: profileQuery } } as any,
      {} as any,
      {} as any,
      { manager: { query: auditQuery } } as any,
      {} as any,
      {} as any,
      { enabled: true } as any,
    );

    await expect(
      service.getAzureFaceBackfillStatus(
        '51936d06-168f-47d2-a12b-33e9306987e2',
      ),
    ).resolves.toEqual({
      azureEnabled: true,
      enrolled: 14,
      linked: 3,
      pending: 11,
      storedPhotoCandidates: 9,
      recaptureNeeded: 2,
      orphanAuditCount: 1,
      complete: false,
    });
  });
});

describe('FaceDeskAdminService Azure backfill rate + training safety', () => {
  it('ensures the face list once per batch, not once per profile', async () => {
    // ensureLargeFaceList is an unconditional Azure PUT. Doing it per profile
    // costs two Azure transactions per face, which doubles the real request
    // rate against the 10 TPS cap shared with live kiosk traffic.
    const { service, azureFace } = makeBackfillService({
      profiles: [
        { profileId: 'p1', employeeId: 'e1' },
        { profileId: 'p2', employeeId: 'e2' },
        { profileId: 'p3', employeeId: 'e3' },
      ],
      sample: { imagePath: 's3://b/k.jpg' },
      photo: PHOTO,
    });
    await service.backfillAzureFaceList('c1', { limit: 3 });

    expect(azureFace.ensureClientList).toHaveBeenCalledTimes(1);
    expect(azureFace.addFaceToList).toHaveBeenCalledTimes(3);
  });

  it('does not touch Azure at all on an empty page', async () => {
    const { service, azureFace } = makeBackfillService({ profiles: [] });
    const res = await service.backfillAzureFaceList('c1');

    expect(azureFace.ensureClientList).not.toHaveBeenCalled();
    expect(azureFace.addFaceToList).not.toHaveBeenCalled();
    // Still trains: an empty final page is how a failed train gets retried.
    expect(azureFace.trainClientList).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ done: true, trained: true });
  });

  it('keeps done=false and returns a cursor when training fails', async () => {
    // trainLargeFaceList resolves on a 429/500 rather than throwing. If that
    // were swallowed, every face just added would stay unsearchable forever:
    // their profiles are already linked, so no later run would select them.
    const { service } = makeBackfillService({
      profiles: [{ profileId: 'p1', employeeId: 'e1' }],
      sample: { imagePath: 's3://b/k.jpg' },
      photo: PHOTO,
      train: jest.fn().mockResolvedValue(false),
    });
    const res = await service.backfillAzureFaceList('c1', { limit: 5 });

    expect(res.registered).toBe(1);
    expect(res.trained).toBe(false);
    expect(res.done).toBe(false);
    // A `while (!done)` caller re-runs from here and trains again.
    expect(res.nextCursor).toBe('p1');
  });

  it('retries training on a re-run of the final empty page', async () => {
    const train = jest.fn().mockResolvedValue(true);
    const { service } = makeBackfillService({ profiles: [], train });
    const res = await service.backfillAzureFaceList('c1', { cursor: 'p1' });

    expect(train).toHaveBeenCalledWith('c1');
    expect(res).toMatchObject({ done: true, trained: true, registered: 0 });
  });

  it('treats a thrown training error as a failure, not a success', async () => {
    const { service } = makeBackfillService({
      profiles: [],
      train: jest.fn().mockRejectedValue(new Error('socket hang up')),
    });
    const res = await service.backfillAzureFaceList('c1', { cursor: 'p9' });

    expect(res.trained).toBe(false);
    expect(res.done).toBe(false);
    expect(res.nextCursor).toBe('p9');
  });
});
