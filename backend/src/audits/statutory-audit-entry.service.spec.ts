import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { StatutoryAuditEntryService } from './statutory-audit-entry.service';
import {
  CATALOGUE_VERSION,
  ENTRY_CATEGORIES,
  entryScore,
} from './statutory-audit-entry.catalogue';

describe('Statutory audit entry', () => {
  const auditor: any = { userId: 'auditor', roleCode: 'AUDITOR' };
  const auditee: any = {
    userId: 'auditee',
    roleCode: 'CLIENT',
    clientId: 'client',
  };
  const category = ENTRY_CATEGORIES[0];
  const point = category.items[0];
  const dto = {
    answer: 'Verified',
    status: 'COMPLIED',
    remarks: '',
    version: 0,
  };
  let service: StatutoryAuditEntryService;
  let audit: any,
    session: any,
    documents: any[],
    answers: any[],
    em: any,
    access: any;
  beforeEach(() => {
    audit = {
      id: 'audit',
      auditType: 'FACTORY',
      assignedAuditorId: 'auditor',
      clientId: 'client',
      branchId: 'branch',
      status: 'IN_PROGRESS',
    };
    session = {
      categories: [category.name],
      catalogue_version: CATALOGUE_VERSION,
      audit_mode: 'PHYSICAL',
    };
    documents = [];
    answers = [];
    em = {
      findOne: jest.fn(async () => audit),
      findOneByOrFail: jest.fn(async () => audit),
      update: jest.fn(),
      query: jest.fn(async (sql: string, params: any[]) => {
        if (sql.startsWith('SELECT * FROM audit_entry_sessions'))
          return session ? [session] : [];
        if (sql.startsWith('SELECT DISTINCT ON')) return documents;
        if (sql.startsWith('SELECT version FROM audit_entry_answers'))
          return answers.filter((a) => a.item_id === params[1]);
        if (sql.startsWith('SELECT * FROM audit_entry_answers')) return answers;
        if (sql.startsWith('SELECT count(*)'))
          return [
            {
              count: answers.filter((a) => a.status === 'NON_COMPLIED').length,
            },
          ];
        if (sql.startsWith('INSERT INTO audit_entry_answers'))
          return [
            {
              item_id: params[1],
              answer: params[2],
              status: params[3],
              remarks: params[4],
              document_token: params[6],
              version: 1,
            },
          ];
        return [];
      }),
    };
    access = {
      getScope: jest.fn(async () => ({ level: 'client', clientId: 'client' })),
    };
    service = new StatutoryAuditEntryService(
      { manager: em, query: em.query, transaction: (fn: any) => fn(em) } as any,
      access,
    );
  });

  it('retains 1,121 unique points in 17 categories with valid weights', () => {
    const items = ENTRY_CATEGORIES.flatMap((c) => c.items);
    expect(ENTRY_CATEGORIES).toHaveLength(17);
    expect(items).toHaveLength(1121);
    expect(new Set(items.map((i) => i.id)).size).toBe(1121);
    expect(
      items.every(
        (i) => Number.isFinite(i.maxMarks) && i.maxMarks >= 0 && i.description,
      ),
    ).toBe(true);
  });
  it('scores applicable answered points using their weights, excluding N/A', () => {
    const items = [2, 3, 8].map((maxMarks, i) => ({
      ...point,
      id: String(i),
      maxMarks,
    }));
    expect(
      entryScore(items, [
        { item_id: '0', status: 'COMPLIED' },
        { item_id: '1', status: 'NON_COMPLIED' },
        { item_id: '2', status: 'NOT_APPLICABLE' },
      ]),
    ).toEqual({ maximum: 5, obtained: 2, percentage: 40 });
    expect(entryScore(items, []).percentage).toBeNull();
  });
  it('prevents another auditor reading the audit', async () => {
    await expect(
      service.read({ ...auditor, userId: 'other' }, 'audit'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(em.query).not.toHaveBeenCalled();
  });
  it('locks the audit before saving a point and permits physical compliance without documents', async () => {
    const result = await service.save(auditor, 'audit', point.id, dto);
    expect(result.status).toBe('COMPLIED');
    expect(em.findOne.mock.calls[0][1].lock.mode).toBe('pessimistic_write');
  });
  it('rejects a point outside the selected category scope', async () => {
    await expect(
      service.save(auditor, 'audit', 'unknown-point', dto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects overwriting an answer saved in another session', async () => {
    answers = [{ item_id: point.id, version: 2 }];
    await expect(
      service.save(auditor, 'audit', point.id, dto),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it.each(['SUBMITTED', 'CORRECTION_PENDING', 'COMPLETED'])(
    'makes %s audit answers immutable',
    async (status) => {
      audit.status = status;
      await expect(
        service.save(auditor, 'audit', point.id, dto),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );
  it.each(['NON_COMPLIED', 'NOT_APPLICABLE'])(
    'requires a reason for %s',
    async (status) => {
      await expect(
        service.save(auditor, 'audit', point.id, { ...dto, status }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('does not configure factory points for a contractor audit', async () => {
    audit.contractorUserId = 'vendor';
    session = null;
    await expect(
      service.configure(auditor, 'audit', {
        unitType: 'FACTORY',
        auditMode: 'PHYSICAL',
        auditeeName: 'Name',
        categories: [category.name],
        scopeAcknowledged: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('cannot submit incomplete categories', async () => {
    await expect(service.submit(auditor, 'audit')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(em.update).not.toHaveBeenCalled();
  });
  it('submits completed physical scope, creates NCs and locks the session', async () => {
    answers = category.items.map((i) => ({
      item_id: i.id,
      status: 'NOT_APPLICABLE',
      answer: 'N/A',
      remarks: 'Outside operations',
    }));
    answers[0] = {
      ...answers[0],
      status: 'NON_COMPLIED',
      answer: 'Missing',
      remarks: 'Record unavailable',
    };
    const result = await service.submit(auditor, 'audit');
    expect(result.status).toBe('CORRECTION_PENDING');
    expect(result.score).toBe(0);
    expect(
      em.query.mock.calls.filter(([sql]: any) =>
        sql.startsWith('INSERT INTO audit_non_compliances'),
      ),
    ).toHaveLength(1);
    expect(
      em.query.mock.calls.some(([sql]: any) =>
        sql.startsWith('UPDATE audit_entry_sessions SET submitted_at'),
      ),
    ).toBe(true);
  });
  it.each([undefined, 'PENDING', 'REJECTED'])(
    'blocks online compliance with document state %s',
    async (review_status) => {
      session.audit_mode = 'ONLINE';
      documents = review_status
        ? [{ id: 'doc', item_id: point.id, review_status }]
        : [];
      await expect(
        service.save(auditor, 'audit', point.id, dto),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('binds online compliance to the approved document version', async () => {
    session.audit_mode = 'ONLINE';
    documents = [
      {
        id: 'doc',
        item_id: point.id,
        review_status: 'APPROVED',
        review_version: 3,
      },
    ];
    expect(
      (await service.save(auditor, 'audit', point.id, dto)).document_token,
    ).toBe('doc:3');
  });
  it('allows a reasoned missing-document NC online', async () => {
    session.audit_mode = 'ONLINE';
    expect(
      (
        await service.save(auditor, 'audit', point.id, {
          ...dto,
          status: 'NON_COMPLIED',
          remarks: 'Document not supplied',
        })
      ).status,
    ).toBe('NON_COMPLIED');
  });
  it('blocks submission if evidence was replaced after saving a conclusion', async () => {
    session.audit_mode = 'ONLINE';
    answers = category.items.map((i) => ({
      item_id: i.id,
      status: 'NOT_APPLICABLE',
      document_token: '',
    }));
    documents = [
      {
        id: 'new-document',
        item_id: point.id,
        review_status: 'APPROVED',
        review_version: 1,
      },
    ];
    await expect(service.submit(auditor, 'audit')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('requires feedback when requesting a re-upload', async () => {
    documents = [{ id: 'doc', item_id: point.id, review_version: 0 }];
    await expect(
      service.reviewDocument(auditor, 'audit', 'doc', {
        status: 'REJECTED',
        remarks: '',
        version: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects a review of a superseded upload', async () => {
    documents = [{ id: 'new-doc', item_id: point.id, review_version: 0 }];
    await expect(
      service.reviewDocument(auditor, 'audit', 'old-doc', {
        status: 'APPROVED',
        remarks: '',
        version: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('does not expose physical checklists through the auditee upload API', async () => {
    await expect(service.auditeeRead(auditee, 'audit')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it.each([
    { level: 'client', clientId: 'other' },
    { level: 'branches', clientId: 'client', branchIds: [] },
    { level: 'branches', clientId: 'client', branchIds: ['other'] },
  ])('rejects auditee access outside scope %j', async (scope) => {
    session.audit_mode = 'ONLINE';
    access.getScope.mockResolvedValue(scope);
    await expect(service.auditeeRead(auditee, 'audit')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('allows a mapped branch auditee without exposing draft answers', async () => {
    session.audit_mode = 'ONLINE';
    access.getScope.mockResolvedValue({
      level: 'branches',
      clientId: 'client',
      branchIds: ['branch'],
    });
    const result = await service.auditeeRead(auditee, 'audit');
    expect(result.items).toHaveLength(category.items.length);
    expect(result).not.toHaveProperty('answers');
  });
  it('rejects a different contractor even in the same company', async () => {
    session.audit_mode = 'ONLINE';
    audit.contractorUserId = 'other';
    await expect(
      service.auditeeRead({ ...auditee, roleCode: 'CONTRACTOR' }, 'audit'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('blocks auditee uploads during review locks', async () => {
    session.audit_mode = 'ONLINE';
    audit.uploadLockFrom = '2000-01-01';
    audit.uploadLockUntil = '2099-12-31';
    await expect(
      service.auditeeUpload(auditee, 'audit', point.id, {} as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('blocks auditee uploads after submission', async () => {
    session.audit_mode = 'ONLINE';
    session.submitted_at = new Date();
    await expect(
      service.auditeeUpload(auditee, 'audit', point.id, {} as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('blocks statutory edits when a report is under review', async () => {
    const original = em.query.getMockImplementation();
    em.query.mockImplementation((sql: string, params: any[]) =>
      sql.startsWith('SELECT status,held_at FROM audit_reports')
        ? Promise.resolve([{ status: 'SUBMITTED' }])
        : original(sql, params),
    );
    await expect(
      service.save(auditor, 'audit', point.id, dto),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('requires existing workspace checklist review before statutory submission', async () => {
    answers = category.items.map((i) => ({
      item_id: i.id,
      status: 'NOT_APPLICABLE',
      answer: 'N/A',
      remarks: 'Not applicable',
    }));
    const original = em.query.getMockImplementation();
    em.query.mockImplementation((sql: string, params: any[]) =>
      sql.startsWith('SELECT 1 FROM audit_checklist_items') &&
      sql.includes('PENDING')
        ? Promise.resolve([{}])
        : original(sql, params),
    );
    await expect(service.submit(auditor, 'audit')).rejects.toThrow(
      'existing workspace checklist',
    );
  });
});
