import { EnrollmentService } from './enrollment.service';
import { ContractorFaceEnrollmentEntity } from './contractor-face-enrollment.entity';
import { FaceEnrollmentHistoryEntity } from './enrollment-history.entity';
import { FaceEnrollmentEntity } from './face-enrollment.entity';
import { KioskEnrollTicketEntity } from './kiosk-enroll-ticket.entity';

describe('EnrollmentService.listEmployeeEnrollments', () => {
  function makeService(query: jest.Mock) {
    return new EnrollmentService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        appendTemplate: jest.fn().mockResolvedValue(undefined),
        purgeSubject: jest.fn().mockResolvedValue(undefined),
      } as any,
      { query } as any,
      {} as any,
    );
  }

  it('lists active employees and left-joins enrollment state by roster branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);

    await service.listEmployeeEnrollments('client-1');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('e.name AS "employeeName"'),
      ['client-1'],
    );
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('FROM (');
    expect(sql).toContain('FROM employees e');
    expect(sql).toContain('LEFT JOIN face_enrollments fe');
    expect(sql).toContain('fe.branch_id IS NOT DISTINCT FROM scoped.branch_id');
    expect(sql).toContain('fe.employee_id IS NOT NULL AS "isEnrolled"');
    expect(sql).not.toContain('e.employee_name');
  });

  it('also includes template rows so transferred or exited employees remain manageable', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);

    await service.listEmployeeEnrollments('client-1');

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('UNION');
    expect(sql).toContain('SELECT fe.employee_id, fe.branch_id');
    expect(sql).toContain('JOIN employees e');
  });

  it('scopes both current employee rows and template rows to user branches', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);

    await service.listEmployeeEnrollments('client-1', ['branch-1', 'branch-2']);

    const sql = query.mock.calls[0][0] as string;
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('e.branch_id = ANY($2::uuid[])'),
      ['client-1', ['branch-1', 'branch-2']],
    );
    expect(sql).toContain('fe.branch_id = ANY($2::uuid[])');
  });
});

describe('EnrollmentService.listContractorEnrollments', () => {
  function makeService(query: jest.Mock) {
    return new EnrollmentService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        appendTemplate: jest.fn().mockResolvedValue(undefined),
        purgeSubject: jest.fn().mockResolvedValue(undefined),
      } as any,
      { query } as any,
      {} as any,
    );
  }

  it('lists active contractor employees and returns the frontend status fields', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);

    await service.listContractorEnrollments('client-1');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ce.name AS "name"'),
      ['client-1'],
    );
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('FROM contractor_employees ce');
    expect(sql).toContain('LEFT JOIN contractor_face_enrollments cfe');
    expect(sql).toContain('ce.contractor_user_id AS "contractorUserId"');
    expect(sql).toContain(
      'cfe.contractor_employee_id IS NOT NULL AS "isEnrolled"',
    );
    expect(sql).not.toContain('ce.name                    AS "employeeName"');
  });

  it('also includes contractor template rows and applies branch scope to both sources', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);

    await service.listContractorEnrollments('client-1', ['branch-1']);

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('UNION');
    expect(sql).toContain('SELECT cfe.contractor_employee_id, cfe.branch_id');
    expect(sql).toContain('ce.branch_id = ANY($2::uuid[])');
    expect(sql).toContain('cfe.branch_id = ANY($2::uuid[])');
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      'client-1',
      ['branch-1'],
    ]);
  });
});

describe('EnrollmentService kiosk tickets', () => {
  function makeService(
    ticketRepo: any,
    query = jest.fn().mockResolvedValue([{ id: 'device-1' }]),
  ) {
    return new EnrollmentService(
      {} as any,
      {} as any,
      ticketRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        appendTemplate: jest.fn().mockResolvedValue(undefined),
        purgeSubject: jest.fn().mockResolvedValue(undefined),
      } as any,
      { query } as any,
      {} as any,
    );
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates kiosk tickets with a short default expiry window', async () => {
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-06-16T10:00:00.000Z').getTime());
    const ticketRepo = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      create: jest.fn((entity) => entity),
      save: jest.fn(async (entity) => entity),
    };
    const service = makeService(ticketRepo);

    const saved = await service.createKioskTicket(
      'client-1',
      'branch-1',
      {
        deviceId: 'device-1',
        subjectType: 'CONTRACTOR',
        contractorEmployeeId: 'contractor-1',
        subjectName: 'Alice',
      } as any,
      'user-1',
    );

    expect(saved.expiresAt.toISOString()).toBe('2026-06-16T10:05:00.000Z');
    expect(ticketRepo.update).toHaveBeenCalledWith(
      { deviceId: 'device-1', clientId: 'client-1', status: 'PENDING' },
      expect.objectContaining({ status: 'CANCELLED' }),
    );
  });

  it('rejects employee kiosk ticket creation after ESS mobile retirement', async () => {
    const service = makeService({} as any);

    await expect(
      service.createKioskTicket(
        'client-1',
        'branch-1',
        {
          deviceId: 'device-1',
          subjectType: 'EMPLOYEE',
          employeeId: 'employee-1',
          subjectName: 'Alice',
        } as any,
        'user-1',
      ),
    ).rejects.toThrow('ESS Mobile Attendance employee enrollment has been retired');
  });

  it('uses the selected kiosk device branch for the enrollment ticket', async () => {
    const ticketRepo = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      create: jest.fn((entity) => entity),
      save: jest.fn(async (entity) => entity),
    };
    const service = makeService(
      ticketRepo,
      jest
        .fn()
        .mockResolvedValue([{ id: 'device-1', branchId: 'branch-kiosk' }]),
    );

    await service.createKioskTicket(
      'client-1',
      null,
      {
        deviceId: 'device-1',
        subjectType: 'CONTRACTOR',
        contractorEmployeeId: 'contractor-1',
        subjectName: 'Alice',
      } as any,
      'user-1',
    );

    expect(ticketRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'branch-kiosk' }),
    );
  });

  it('rejects kiosk tickets for devices outside the caller branch scope', async () => {
    const ticketRepo = {
      update: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const service = makeService(
      ticketRepo,
      jest.fn().mockResolvedValue([{ id: 'device-1', branchId: 'branch-2' }]),
    );

    await expect(
      service.createKioskTicket(
        'client-1',
        'branch-1',
        {
          deviceId: 'device-1',
          subjectType: 'CONTRACTOR',
          contractorEmployeeId: 'contractor-1',
          subjectName: 'Alice',
        } as any,
        'user-1',
        ['branch-1'],
      ),
    ).rejects.toThrow('Selected kiosk device is not active for your branch');
    expect(ticketRepo.create).not.toHaveBeenCalled();
  });

  it('rejects ticket creation for a device that is not an active kiosk for the client', async () => {
    const ticketRepo = {
      update: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(ticketRepo, query);

    await expect(
      service.createKioskTicket(
        'client-1',
        'branch-1',
        {
          deviceId: 'device-1',
          subjectType: 'CONTRACTOR',
          contractorEmployeeId: 'contractor-1',
          subjectName: 'Alice',
        } as any,
        'user-1',
      ),
    ).rejects.toThrow('Selected kiosk device is not active for this client');

    expect(ticketRepo.update).not.toHaveBeenCalled();
    expect(ticketRepo.save).not.toHaveBeenCalled();
  });

  it('expires old pending tickets before returning the current pending ticket', async () => {
    const execute = jest.fn().mockResolvedValue({ affected: 1 });
    const getOne = jest.fn().mockResolvedValue({ id: 'ticket-1' });
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute,
    };
    const selectBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne,
    };
    const ticketRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(updateBuilder)
        .mockReturnValueOnce(updateBuilder)
        .mockReturnValueOnce(selectBuilder),
    };
    const service = makeService(ticketRepo);

    const ticket = await service.getPendingTicketForDevice('device-1');

    expect(ticket).toEqual({ id: 'ticket-1' });
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CANCELLED' }),
    );
    expect(updateBuilder.set).toHaveBeenCalledWith({ status: 'EXPIRED' });
    expect(updateBuilder.andWhere).toHaveBeenCalledWith('expires_at <= now()');
    expect(selectBuilder.andWhere).toHaveBeenCalledWith(
      'ticket.expiresAt > now()',
    );
  });

  it('uses the ticket creator as the kiosk enrollment audit actor', async () => {
    const frame = Buffer.from(new Float32Array([1, 0, 0, 0]).buffer).toString(
      'base64',
    );
    const ticket = {
      id: 'ticket-1',
      clientId: 'client-1',
      branchId: 'branch-1',
      deviceId: 'device-1',
      subjectType: 'CONTRACTOR',
      employeeId: null,
      contractorEmployeeId: 'contractor-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      createdBy: 'user-created-ticket',
    };
    const savedEntities: Array<{ target: unknown; entity: any }> = [];
    const execute = jest.fn().mockResolvedValue({ raw: [{ id: 'ticket-1' }] });
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute,
    };
    const manager = {
      findOne: jest.fn(async (target: unknown) =>
        target === KioskEnrollTicketEntity ? ticket : null,
      ),
      save: jest.fn(async (target: unknown, entity: any) => {
        savedEntities.push({ target, entity });
        return entity;
      }),
      createQueryBuilder: jest.fn(() => updateBuilder),
    };
    const ticketRepo = {
      findOne: jest.fn().mockResolvedValue(ticket),
    };
    const livenessService = {
      consumeNonce: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(async (fn: any) => fn(manager)),
    };
    const service = new EnrollmentService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      ticketRepo as any,
      {} as any,
      livenessService as any,
      {} as any,
      { enabled: false } as any,
      {
        appendTemplate: jest.fn().mockResolvedValue(undefined),
        purgeSubject: jest.fn().mockResolvedValue(undefined),
      } as any,
      dataSource as any,
      {} as any,
    );

    await service.submitKioskTicket('device-1', {
      ticketId: 'ticket-1',
      consentGiven: true,
      embeddingFrames: [frame, frame, frame],
      embeddingModel: 'mobilefacenet',
      livenessNonce: 'nonce-1',
      livenessChallengeType: 'BLINK',
    } as any);

    const historySave = savedEntities.find(
      (entry) => entry.target === FaceEnrollmentHistoryEntity,
    );
    expect(historySave?.entity.actorUserId).toBe('user-created-ticket');
    expect(savedEntities).not.toContainEqual(
      expect.objectContaining({
        entity: expect.objectContaining({ actorUserId: 'device-1' }),
      }),
    );
  });

  it('continues kiosk enrollment when optional photo services fail', async () => {
    const frame = Buffer.from(new Float32Array([1, 0, 0, 0]).buffer).toString(
      'base64',
    );
    const ticket = {
      id: 'ticket-1',
      clientId: 'client-1',
      branchId: 'branch-1',
      deviceId: 'device-1',
      subjectType: 'CONTRACTOR',
      employeeId: null,
      contractorEmployeeId: 'contractor-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      createdBy: 'user-created-ticket',
    };
    const execute = jest.fn().mockResolvedValue({ raw: [{ id: 'ticket-1' }] });
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute,
    };
    const manager = {
      findOne: jest.fn(async (target: unknown) =>
        target === KioskEnrollTicketEntity ? ticket : null,
      ),
      save: jest.fn(async (_target: unknown, entity: any) => entity),
      createQueryBuilder: jest.fn(() => updateBuilder),
    };
    const service = new EnrollmentService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { findOne: jest.fn().mockResolvedValue(ticket) } as any,
      {} as any,
      { consumeNonce: jest.fn().mockResolvedValue(undefined) } as any,
      {
        uploadPhoto: jest.fn().mockRejectedValue(new Error('disk full')),
      } as any,
      {
        enabled: true,
        extractEmbedding: jest
          .fn()
          .mockRejectedValue(new Error('face-svc down')),
      } as any,
      {
        appendTemplate: jest.fn().mockResolvedValue(undefined),
        purgeSubject: jest.fn().mockResolvedValue(undefined),
      } as any,
      {
        query: jest.fn().mockResolvedValue([]),
        transaction: jest.fn(async (fn: any) => fn(manager)),
      } as any,
      {} as any,
    );

    await expect(
      service.submitKioskTicket('device-1', {
        ticketId: 'ticket-1',
        consentGiven: true,
        embeddingFrames: [frame, frame, frame],
        embeddingModel: 'mobilefacenet',
        livenessNonce: 'nonce-1',
        livenessChallengeType: 'BLINK',
        photoB64: 'not-a-real-photo',
      } as any),
    ).resolves.toEqual(ticket);

    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'COMPLETED', photoUrl: null }),
    );
  });

  it('rejects employee kiosk ticket submission after ESS mobile retirement', async () => {
    const ticket = {
      id: 'ticket-1',
      clientId: 'client-1',
      branchId: 'branch-1',
      deviceId: 'device-1',
      subjectType: 'EMPLOYEE',
      employeeId: 'employee-1',
      contractorEmployeeId: null,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      createdBy: 'user-created-ticket',
    };
    const service = new EnrollmentService(
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue(ticket) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.submitKioskTicket('device-1', {
        ticketId: 'ticket-1',
        consentGiven: true,
        embeddingFrames: ['a', 'b', 'c'],
        livenessNonce: 'nonce-1',
      } as any),
    ).rejects.toThrow('ESS Mobile Attendance employee enrollment has been retired');
  });
});

describe('EnrollmentService duplicate detection', () => {
  function makeEmbeddingBuffer(values: number[]) {
    return Buffer.from(new Float32Array(values).buffer);
  }

  it('rejects same-face duplicate enrollments at the live match threshold', async () => {
    const probe = new Float32Array([1, 0, 0, 0]);
    const cosine = 0.75;
    const existing = [cosine, Math.sqrt(1 - cosine * cosine), 0, 0];
    const service = new EnrollmentService(
      {
        find: jest.fn().mockResolvedValue([
          {
            employeeId: 'employee-existing',
            embedding: makeEmbeddingBuffer(existing),
          },
        ]),
      } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        appendTemplate: jest.fn().mockResolvedValue(undefined),
        purgeSubject: jest.fn().mockResolvedValue(undefined),
      } as any,
      { query: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
    );

    await expect(
      service.assertNotDuplicate('client-1', probe, {
        excludeEmployeeId: 'employee-new',
      }),
    ).rejects.toThrow('Face too similar to existing employee enrollment');
  });
});

describe('EnrollmentService self-enrollment embeddings', () => {
  const deviceEmbedding = new Float32Array([1, 0, 0, 0]);
  const authoritativeEmbedding = new Float32Array([0, 1, 0, 0]);

  function makeService(subject: 'EMPLOYEE' | 'CONTRACTOR') {
    const appendTemplate = jest.fn().mockResolvedValue(undefined);
    const manager = {
      create: jest.fn((_target: unknown, entity: any) => entity),
      save: jest.fn(async (_target: unknown, entity: any) => entity),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue(
        subject === 'CONTRACTOR'
          ? [{ id: 'contractor-1', branch_id: 'branch-1' }]
          : [],
      ),
      transaction: jest.fn(async (fn: any) => fn(manager)),
    };
    const service = new EnrollmentService(
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { appendTemplate, purgeSubject: jest.fn() } as any,
      dataSource as any,
      {} as any,
    );
    jest.spyOn(service as any, 'buildSelfEnrollEmbedding').mockResolvedValue({
      embedding: Buffer.from(authoritativeEmbedding.buffer),
      embeddingModel: 'server-model',
      averaged: deviceEmbedding,
    });
    const duplicateCheck = jest
      .spyOn(service, 'assertNotDuplicate')
      .mockResolvedValue(undefined);
    return { service, appendTemplate, duplicateCheck };
  }

  const dto = {
    consentGiven: true,
    embeddingFrames: Array(7).fill('frame'),
  } as any;

  it('uses the authoritative employee embedding for duplicate checks and gallery storage', async () => {
    const { service, appendTemplate, duplicateCheck } = makeService('EMPLOYEE');

    await service.enrollSelf(
      'employee-1',
      'client-1',
      'branch-1',
      dto,
      'user-1',
    );

    expect(duplicateCheck).toHaveBeenCalledWith(
      'client-1',
      authoritativeEmbedding,
      { excludeEmployeeId: 'employee-1' },
    );
    expect(appendTemplate).toHaveBeenCalledWith(
      'client-1',
      'branch-1',
      'EMPLOYEE',
      'employee-1',
      authoritativeEmbedding,
      'server-model',
      'ENROLL',
      'user-1',
    );
  });

  it('uses the authoritative contractor embedding for duplicate checks and gallery storage', async () => {
    const { service, appendTemplate, duplicateCheck } =
      makeService('CONTRACTOR');

    await service.enrollContractorSelf(
      'contractor-1',
      'client-1',
      null,
      dto,
      'user-1',
    );

    expect(duplicateCheck).toHaveBeenCalledWith(
      'client-1',
      authoritativeEmbedding,
      { excludeContractorId: 'contractor-1' },
    );
    expect(appendTemplate).toHaveBeenCalledWith(
      'client-1',
      'branch-1',
      'CONTRACTOR',
      'contractor-1',
      authoritativeEmbedding,
      'server-model',
      'ENROLL',
      'user-1',
    );
  });
});

describe('EnrollmentService.deactivateEnrollment', () => {
  function makeService(manager: any) {
    return new EnrollmentService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        appendTemplate: jest.fn().mockResolvedValue(undefined),
        purgeSubject: jest.fn().mockResolvedValue(undefined),
      } as any,
      { transaction: jest.fn(async (fn: any) => fn(manager)) } as any,
      {} as any,
    );
  }

  it('accepts the frontend subjectType/subjectId payload for employee deactivation', async () => {
    const rec = {
      isActive: true,
      deactivatedAt: null,
      deactivationReason: null,
      embedding: Buffer.from([1, 2, 3]),
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(rec),
      save: jest.fn(async (_targetOrEntity: any, entity?: any) => entity),
      delete: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
    };
    const service = makeService(manager);

    const result = await service.deactivateEnrollment(
      'client-1',
      {
        subjectType: 'EMPLOYEE',
        subjectId: '11111111-1111-4111-8111-111111111111',
        reason: 'Wrong enrollment',
      } as any,
      '22222222-2222-4222-8222-222222222222',
    );

    expect(manager.findOne).toHaveBeenCalledWith(FaceEnrollmentEntity, {
      where: {
        employeeId: '11111111-1111-4111-8111-111111111111',
        clientId: 'client-1',
      },
    });
    expect(manager.save).toHaveBeenCalledWith(
      FaceEnrollmentHistoryEntity,
      expect.objectContaining({
        employeeId: '11111111-1111-4111-8111-111111111111',
        action: 'DEACTIVATE',
      }),
    );
    expect(rec.isActive).toBe(false);
    expect(rec.embedding).toEqual(Buffer.alloc(0));
    expect(result).toEqual({
      ok: true,
      deactivated: true,
      employeeId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('permanently deletes contractor enrollment rows after audit history is written', async () => {
    const rec = {
      contractorEmployeeId: 'contractor-1',
      branchId: 'branch-1',
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(rec),
      save: jest.fn(async (_targetOrEntity: any, entity?: any) => entity),
      delete: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
    };
    const service = makeService(manager);

    const result = await service.deactivateEnrollment(
      'client-1',
      {
        subjectType: 'CONTRACTOR',
        subjectId: '33333333-3333-4333-8333-333333333333',
        permanent: true,
        reason: 'Wrong enrollment',
      } as any,
      '22222222-2222-4222-8222-222222222222',
    );

    expect(manager.findOne).toHaveBeenCalledWith(
      ContractorFaceEnrollmentEntity,
      {
        where: {
          contractorEmployeeId: '33333333-3333-4333-8333-333333333333',
          clientId: 'client-1',
        },
      },
    );
    expect(manager.save).toHaveBeenCalledWith(
      FaceEnrollmentHistoryEntity,
      expect.objectContaining({
        contractorEmployeeId: '33333333-3333-4333-8333-333333333333',
        action: 'DELETE',
      }),
    );
    expect(manager.delete).toHaveBeenCalledWith(
      ContractorFaceEnrollmentEntity,
      {
        contractorEmployeeId: '33333333-3333-4333-8333-333333333333',
        clientId: 'client-1',
      },
    );
    expect(result).toEqual({
      ok: true,
      deleted: true,
      contractorEmployeeId: '33333333-3333-4333-8333-333333333333',
    });
  });

  it('does not permanently delete enrollments outside the caller branch scope', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        employeeId: '11111111-1111-4111-8111-111111111111',
        branchId: 'branch-2',
      }),
      save: jest.fn(),
      delete: jest.fn(),
    };
    const service = makeService(manager);

    await expect(
      service.deactivateEnrollment(
        'client-1',
        {
          subjectType: 'EMPLOYEE',
          subjectId: '11111111-1111-4111-8111-111111111111',
          permanent: true,
          reason: 'Wrong enrollment',
        } as any,
        '22222222-2222-4222-8222-222222222222',
        ['branch-1'],
      ),
    ).rejects.toThrow('Enrollment not found');
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.delete).not.toHaveBeenCalled();
  });
});
