import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MobileAttendanceService } from './mobile-attendance.service';

/**
 * Focused unit tests for the kiosk-supervised enrollment service methods.
 * Each test stubs only the repositories / dependencies it needs and casts
 * everything else as `any` — mirroring the pattern in
 * mobile-attendance.service.spec.ts.
 *
 * Constructor arg order (mirrored from the service):
 *   0  faceRepo
 *   1  contractorFaceRepo
 *   2  contractorPunchRepo
 *   3  deviceRepo
 *   4  nonceRepo
 *   5  empRepo
 *   6  contractorEmpRepo
 *   7  attendanceShiftRepo
 *   8  kioskTicketRepo
 *   9  biometricService
 *  10  faceEmbeddingClient
 *  11  notifications
 *  12  facePhotos
 *  13  padProvider
 *  14  maskDetector
 *  15  ds
 */
type Deps = {
  faceRepo?: any;
  contractorFaceRepo?: any;
  deviceRepo?: any;
  empRepo?: any;
  contractorEmpRepo?: any;
  kioskTicketRepo?: any;
  facePhotos?: any;
  ds?: any;
};

const livenessBody = {
  livenessNonce: 'nonce-1',
  livenessChallengeType: 'BLINK',
  livenessChallengePassedAt: new Date().toISOString(),
} as const;

const livenessDs = (challengeType = 'BLINK') => ({
  query: jest.fn().mockResolvedValue([{ challenge_type: challengeType }]),
});

const makeService = (d: Deps = {}): MobileAttendanceService =>
  new MobileAttendanceService(
    d.faceRepo ?? ({} as any),
    d.contractorFaceRepo ?? ({} as any),
    {} as any,
    d.deviceRepo ?? ({} as any),
    {} as any,
    d.empRepo ?? ({} as any),
    d.contractorEmpRepo ?? ({} as any),
    {} as any,
    d.kioskTicketRepo ?? ({} as any),
    {} as any,
    {} as any,
    {} as any,
    d.facePhotos ?? ({} as any),
    {} as any,
    {} as any,
    d.ds ?? ({} as any),
  );

describe('MobileAttendanceService.createKioskEnrollTicket', () => {
  const baseBody = {
    deviceId: 'dev-1',
    subjectType: 'EMPLOYEE' as const,
    subjectId: 'emp-1',
    consentGiven: true,
  };
  const activeKioskDevice = {
    id: 'dev-1',
    clientId: 'c-1',
    mode: 'KIOSK',
    isActive: true,
    branchId: 'b-1',
  };
  const activeEmployee = {
    id: 'emp-1',
    clientId: 'c-1',
    name: 'Alice',
    employeeCode: 'E001',
    branchId: 'b-1',
    isActive: true,
  };

  it('throws when consent is missing', async () => {
    const svc = makeService();
    await expect(
      svc.createKioskEnrollTicket('c-1', 'user-1', null, {
        ...baseBody,
        consentGiven: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFound when device does not exist', async () => {
    const deviceRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const svc = makeService({ deviceRepo });
    await expect(
      svc.createKioskEnrollTicket('c-1', 'user-1', null, baseBody),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects ESS-mode devices', async () => {
    const deviceRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ ...activeKioskDevice, mode: 'ESS' }),
    };
    const svc = makeService({ deviceRepo });
    await expect(
      svc.createKioskEnrollTicket('c-1', 'user-1', null, baseBody),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when allowedBranchIds excludes the device branch', async () => {
    const deviceRepo = {
      findOne: jest.fn().mockResolvedValue(activeKioskDevice),
    };
    const svc = makeService({ deviceRepo });
    await expect(
      svc.createKioskEnrollTicket('c-1', 'user-1', ['b-2'], baseBody),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects employee whose branch differs from the device branch', async () => {
    const deviceRepo = {
      findOne: jest.fn().mockResolvedValue(activeKioskDevice),
    };
    const empRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ ...activeEmployee, branchId: 'b-other' }),
    };
    const svc = makeService({ deviceRepo, empRepo });
    await expect(
      svc.createKioskEnrollTicket('c-1', 'user-1', null, baseBody),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancels any existing PENDING ticket for the device before inserting', async () => {
    const deviceRepo = {
      findOne: jest.fn().mockResolvedValue(activeKioskDevice),
    };
    const empRepo = { findOne: jest.fn().mockResolvedValue(activeEmployee) };
    const update = jest.fn().mockResolvedValue({});
    const create = jest.fn((x) => x);
    const save = jest
      .fn()
      .mockImplementation(async (x) => ({ id: 't-1', ...x }));
    const kioskTicketRepo = { update, create, save };

    const svc = makeService({ deviceRepo, empRepo, kioskTicketRepo });
    const t = await svc.createKioskEnrollTicket(
      'c-1',
      'user-1',
      null,
      baseBody,
    );

    expect(update).toHaveBeenCalledWith(
      { deviceId: 'dev-1', status: 'PENDING' },
      expect.objectContaining({ status: 'CANCELLED', cancelledBy: 'user-1' }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'c-1',
        branchId: 'b-1',
        deviceId: 'dev-1',
        subjectType: 'EMPLOYEE',
        employeeId: 'emp-1',
        contractorEmployeeId: null,
        subjectName: 'Alice',
        subjectCode: 'E001',
        consentGiven: true,
        status: 'PENDING',
        createdBy: 'user-1',
      }),
    );
    expect(save).toHaveBeenCalled();
    expect(t.id).toBe('t-1');

    // expiresAt must be ~30 min in the future.
    const ttlMs = (t as any).expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(29 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(30 * 60 * 1000 + 1000);
  });

  it('uses contractor repo for subjectType=CONTRACTOR', async () => {
    const deviceRepo = {
      findOne: jest.fn().mockResolvedValue(activeKioskDevice),
    };
    const contractorEmpRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'ce-1',
        clientId: 'c-1',
        name: 'Bob',
        branchId: 'b-1',
        isActive: true,
      }),
    };
    const kioskTicketRepo = {
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn((x) => x),
      save: jest.fn().mockImplementation(async (x) => ({ id: 't-2', ...x })),
    };
    const svc = makeService({ deviceRepo, contractorEmpRepo, kioskTicketRepo });
    await svc.createKioskEnrollTicket('c-1', 'user-1', null, {
      ...baseBody,
      subjectType: 'CONTRACTOR',
      subjectId: 'ce-1',
    });
    expect(kioskTicketRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: 'CONTRACTOR',
        contractorEmployeeId: 'ce-1',
        employeeId: null,
        subjectName: 'Bob',
      }),
    );
  });
});

describe('MobileAttendanceService.getPendingKioskEnrollTicket', () => {
  it('returns null for non-KIOSK devices without touching the repo', async () => {
    const findOne = jest.fn();
    const svc = makeService({
      kioskTicketRepo: { findOne },
      ds: { query: jest.fn() },
    });
    const result = await svc.getPendingKioskEnrollTicket({
      id: 'd',
      mode: 'ESS',
    } as any);
    expect(result).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('expires stale tickets and returns the latest PENDING', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const findOne = jest
      .fn()
      .mockResolvedValue({ id: 't-1', status: 'PENDING' });
    const svc = makeService({
      kioskTicketRepo: { findOne },
      ds: { query },
    });
    const t = await svc.getPendingKioskEnrollTicket({
      id: 'd-1',
      mode: 'KIOSK',
    } as any);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'EXPIRED'"),
      ['d-1'],
    );
    expect(findOne).toHaveBeenCalledWith({
      where: { deviceId: 'd-1', status: 'PENDING' },
      order: { createdAt: 'DESC' },
    });
    expect(t?.id).toBe('t-1');
  });
});

describe('MobileAttendanceService.getKioskEnrollTicket', () => {
  it('auto-expires a PENDING ticket whose expiry has passed', async () => {
    const past = new Date(Date.now() - 60_000);
    const update = jest.fn().mockResolvedValue({});
    const findOne = jest.fn().mockResolvedValue({
      id: 't-1',
      clientId: 'c-1',
      status: 'PENDING',
      expiresAt: past,
    });
    const svc = makeService({ kioskTicketRepo: { findOne, update } });
    const t = await svc.getKioskEnrollTicket('c-1', 't-1');
    expect(update).toHaveBeenCalledWith({ id: 't-1' }, { status: 'EXPIRED' });
    expect(t.status).toBe('EXPIRED');
  });

  it('throws NotFound when no row matches client+id', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const svc = makeService({ kioskTicketRepo: { findOne } });
    await expect(svc.getKioskEnrollTicket('c-1', 't-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('MobileAttendanceService.cancelKioskEnrollTicket', () => {
  it('cancels a PENDING ticket', async () => {
    const update = jest.fn().mockResolvedValue({});
    const findOne = jest.fn().mockResolvedValue({
      id: 't-1',
      clientId: 'c-1',
      status: 'PENDING',
    });
    const svc = makeService({ kioskTicketRepo: { findOne, update } });
    const r = await svc.cancelKioskEnrollTicket('c-1', 'user-1', 't-1');
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(
      { id: 't-1' },
      expect.objectContaining({ status: 'CANCELLED', cancelledBy: 'user-1' }),
    );
  });

  it('is a no-op when the ticket is already terminal', async () => {
    const update = jest.fn();
    const findOne = jest.fn().mockResolvedValue({
      id: 't-1',
      clientId: 'c-1',
      status: 'COMPLETED',
    });
    const svc = makeService({ kioskTicketRepo: { findOne, update } });
    const r = await svc.cancelKioskEnrollTicket('c-1', 'user-1', 't-1');
    expect(r).toEqual({ ok: true });
    expect(update).not.toHaveBeenCalled();
  });

  it('throws NotFound when no row matches', async () => {
    const svc = makeService({
      kioskTicketRepo: { findOne: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      svc.cancelKioskEnrollTicket('c-1', 'user-1', 't-x'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MobileAttendanceService.listKioskEnrollTickets', () => {
  const makeQb = (rows: any[]) => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    return qb;
  };

  it('scopes by client and optional status + branch', async () => {
    const qb = makeQb([{ id: 't-1' }]);
    const svc = makeService({
      kioskTicketRepo: { createQueryBuilder: jest.fn().mockReturnValue(qb) },
    });
    const rows = await svc.listKioskEnrollTickets(
      'c-1',
      ['b-1', 'b-2'],
      'PENDING',
    );
    expect(rows).toEqual([{ id: 't-1' }]);
    expect(qb.where).toHaveBeenCalledWith('t.client_id = :clientId', {
      clientId: 'c-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('t.status = :status', {
      status: 'PENDING',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('t.branch_id = ANY(:bids)', {
      bids: ['b-1', 'b-2'],
    });
    expect(qb.orderBy).toHaveBeenCalledWith('t.created_at', 'DESC');
    expect(qb.limit).toHaveBeenCalledWith(100);
  });

  it('omits branch filter when allowedBranchIds is null', async () => {
    const qb = makeQb([]);
    const svc = makeService({
      kioskTicketRepo: { createQueryBuilder: jest.fn().mockReturnValue(qb) },
    });
    await svc.listKioskEnrollTickets('c-1', null);
    const branchCall = (qb.andWhere as jest.Mock).mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('branch_id'),
    );
    expect(branchCall).toBeUndefined();
  });
});

describe('MobileAttendanceService.submitKioskEnrollTicket', () => {
  const kioskDevice = { id: 'd-1', mode: 'KIOSK' };
  const embeddingB64 = (values: number[]) => {
    const buf = Buffer.alloc(values.length * 4);
    values.forEach((v, i) => buf.writeFloatLE(v, i * 4));
    return buf.toString('base64');
  };

  it('rejects ESS-mode devices', async () => {
    const svc = makeService();
    await expect(
      svc.submitKioskEnrollTicket({ id: 'd-1', mode: 'ESS' } as any, 't-1', {
        embeddingBase64: 'AAAA',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFound for missing ticket', async () => {
    const svc = makeService({
      kioskTicketRepo: { findOne: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      svc.submitKioskEnrollTicket(kioskDevice as any, 't-x', {
        embeddingBase64: 'AAAA',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a ticket issued to a different device', async () => {
    const svc = makeService({
      kioskTicketRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 't-1',
          deviceId: 'd-other',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    });
    await expect(
      svc.submitKioskEnrollTicket(kioskDevice as any, 't-1', {
        embeddingBase64: 'AAAA',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws Conflict when ticket is not PENDING', async () => {
    const svc = makeService({
      kioskTicketRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 't-1',
          deviceId: 'd-1',
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    });
    await expect(
      svc.submitKioskEnrollTicket(kioskDevice as any, 't-1', {
        embeddingBase64: 'AAAA',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('expires + throws Conflict when ticket TTL has passed', async () => {
    const update = jest.fn().mockResolvedValue({});
    const svc = makeService({
      kioskTicketRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 't-1',
          deviceId: 'd-1',
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 1000),
        }),
        update,
      },
    });
    await expect(
      svc.submitKioskEnrollTicket(kioskDevice as any, 't-1', {
        embeddingBase64: 'AAAA',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).toHaveBeenCalledWith({ id: 't-1' }, { status: 'EXPIRED' });
  });

  it('rejects malformed (odd-length) embedding payload', async () => {
    const svc = makeService({
      kioskTicketRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 't-1',
          deviceId: 'd-1',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 60_000),
          subjectType: 'EMPLOYEE',
          employeeId: 'e-1',
          clientId: 'c-1',
          subjectCode: 'E001',
          branchId: 'b-1',
          createdBy: 'user-1',
        }),
      },
    });
    // 3 bytes (not multiple of 4) — must fail validation.
    await expect(
      svc.submitKioskEnrollTicket(kioskDevice as any, 't-1', {
        embeddingBase64: Buffer.from([1, 2, 3]).toString('base64'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('auto-approves successful employee kiosk enrollment with the ticket creator UUID', async () => {
    const embedding = Buffer.from(embeddingB64([1, 0]), 'base64');
    const pendingTicket = {
      id: 't-1',
      deviceId: 'd-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      subjectType: 'EMPLOYEE',
      employeeId: 'emp-divya',
      clientId: 'c-1',
      subjectCode: 'DIVYA',
      branchId: 'b-1',
      createdBy: '11111111-1111-1111-1111-111111111111',
    };
    const reviewTicket = {
      ...pendingTicket,
      status: 'REVIEW_PENDING',
      pendingEmbedding: embedding,
      embeddingModel: 'mobilefacenet-v1',
      photoUrl: null,
    };
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const txSave = jest.fn().mockResolvedValue({});
    const txQuery = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 1 });
    const tx = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      save: txSave,
      query: txQuery,
    };
    const faceRepo = {
      manager: {
        query: jest.fn().mockResolvedValue(undefined),
        transaction: jest.fn(async (cb) => cb(tx)),
      },
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((payload) => payload),
    };
    const svc = makeService({
      faceRepo,
      contractorFaceRepo: { find: jest.fn().mockResolvedValue([]) },
      kioskTicketRepo: {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(pendingTicket)
          .mockResolvedValueOnce(reviewTicket),
        find: jest.fn().mockResolvedValue([]),
        update,
      },
      facePhotos: { put: jest.fn().mockResolvedValue(null) },
      ds: livenessDs('SMILE'),
    });

    await expect(
      svc.submitKioskEnrollTicket(kioskDevice as any, 't-1', {
        embeddingBase64: embedding.toString('base64'),
        ...livenessBody,
        livenessChallengeType: 'SMILE',
      }),
    ).resolves.toEqual({ ok: true, ticketId: 't-1' });

    expect(txSave).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        employeeId: 'emp-divya',
        enrolledBy: '11111111-1111-1111-1111-111111111111',
        consentGivenBy: '11111111-1111-1111-1111-111111111111',
      }),
    );
    expect(update).toHaveBeenCalledWith(
      { id: 't-1' },
      expect.objectContaining({
        status: 'REVIEW_PENDING',
      }),
    );
    expect(txQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE kiosk_enroll_tickets'),
      expect.arrayContaining(['11111111-1111-1111-1111-111111111111', 't-1']),
    );
  });

  it('rejects employee enrollment when the submitted face matches another employee', async () => {
    const ticket = {
      id: 't-1',
      deviceId: 'd-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      subjectType: 'EMPLOYEE',
      employeeId: 'emp-divya',
      clientId: 'c-1',
      subjectCode: 'DIVYA',
      branchId: 'b-1',
      createdBy: 'user-1',
    };
    const faceRepo = {
      manager: { query: jest.fn().mockResolvedValue(undefined) },
      find: jest.fn().mockResolvedValue([
        {
          employeeId: 'emp-karthik',
          clientId: 'c-1',
          isActive: true,
          embedding: Buffer.from(embeddingB64([1, 0]), 'base64'),
        },
      ]),
    };
    const contractorFaceRepo = { find: jest.fn().mockResolvedValue([]) };
    const empRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'emp-karthik',
        employeeCode: 'KARTHIK',
        name: 'Cheguri Karthik',
      }),
    };
    const svc = makeService({
      faceRepo,
      contractorFaceRepo,
      empRepo,
      kioskTicketRepo: { findOne: jest.fn().mockResolvedValue(ticket) },
      ds: livenessDs(),
    });

    await expect(
      svc.submitKioskEnrollTicket(kioskDevice as any, 't-1', {
        // raw cosine 0.80 => mapped duplicate score 0.90, above the 0.88 guard.
        embeddingBase64: embeddingB64([0.8, 0.6]),
        ...livenessBody,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(faceRepo.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('face_duplicate_attempt_logs'),
      expect.arrayContaining(['emp-divya', 'emp-karthik']),
    );
  });

  it('rejects contractor kiosk enrollment when the face is already enrolled to an employee', async () => {
    const ticket = {
      id: 't-2',
      deviceId: 'd-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      subjectType: 'CONTRACTOR',
      contractorEmployeeId: 'ce-1',
      clientId: 'c-1',
      branchId: 'b-1',
      createdBy: 'user-1',
    };
    const faceRepo = {
      manager: { query: jest.fn().mockResolvedValue(undefined) },
      find: jest.fn().mockResolvedValue([
        {
          employeeId: 'emp-karthik',
          clientId: 'c-1',
          isActive: true,
          embedding: Buffer.from(embeddingB64([1, 0]), 'base64'),
        },
      ]),
    };
    const contractorFaceRepo = { find: jest.fn().mockResolvedValue([]) };
    const contractorEmpRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'ce-1',
        clientId: 'c-1',
        name: 'Vendor Worker',
        branchId: 'b-1',
      }),
    };
    const empRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'emp-karthik',
        employeeCode: 'KARTHIK',
        name: 'Cheguri Karthik',
      }),
    };
    const contractorSave = jest.fn();
    const svc = makeService({
      faceRepo,
      contractorFaceRepo: { ...contractorFaceRepo, save: contractorSave },
      contractorEmpRepo,
      empRepo,
      kioskTicketRepo: { findOne: jest.fn().mockResolvedValue(ticket) },
      ds: livenessDs(),
    });

    await expect(
      svc.submitKioskEnrollTicket(kioskDevice as any, 't-2', {
        embeddingBase64: embeddingB64([0.8, 0.6]),
        ...livenessBody,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(contractorSave).not.toHaveBeenCalled();
  });
});
