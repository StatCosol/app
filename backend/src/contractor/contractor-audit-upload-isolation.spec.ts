import { ContractorDocumentsService } from './contractor-documents.service';

describe('Contractor audit upload classification', () => {
  const user: any = { id: 'vendor', clientId: 'client' };
  const dto: any = {
    branchId: 'branch',
    docType: 'CLRA_LICENSE',
    title: 'Licence evidence',
    auditId: 'audit',
    month: '2026-10',
  };
  const file: any = {
    originalname: 'licence.pdf',
    path: 'uploads/test.pdf',
    mimetype: 'application/pdf',
    size: 10,
  };
  function setup(notes: string) {
    const audit: any = {
      id: 'audit',
      clientId: 'client',
      branchId: 'branch',
      contractorUserId: 'vendor',
      auditType: 'CONTRACTOR',
      notes,
    };
    const repo: any = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 'new-doc' })),
    };
    const auditRepo: any = { findOne: jest.fn(async () => audit) };
    const service = new ContractorDocumentsService(
      repo,
      { findOne: jest.fn(async () => ({})) } as any,
      auditRepo,
      { findOne: jest.fn() } as any,
      { invalidateBranch: jest.fn(async () => {}) } as any,
    );
    return { service, repo, auditRepo, audit };
  }
  it.each(['TEST ONLY audit fixture', 'SYNTHETIC TEST ONLY audit fixture'])(
    'inherits isolation from %s even with an ordinary filename/title',
    async (notes) => {
      const t = setup(notes);
      const result = await t.service.contractorUpload(user, dto, file);
      expect(result.title).toBe('TEST ONLY Licence evidence');
      expect(t.repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          auditId: 'audit',
          branchId: 'branch',
          docMonth: '2026-10',
          status: 'PENDING_REVIEW',
        }),
      );
    },
  );
  it('preserves actual titles and already marked test evidence', async () => {
    const actual = setup('Actual audit');
    expect((await actual.service.contractorUpload(user, dto, file)).title).toBe(
      dto.title,
    );
    const test = setup('TEST ONLY audit');
    expect(
      (
        await test.service.contractorUpload(
          user,
          { ...dto, title: 'TEST ONLY existing' },
          file,
        )
      ).title,
    ).toBe('TEST ONLY existing');
  });
  it.each(['clientId', 'branchId', 'contractorUserId'])(
    'retains %s ownership restrictions for test audits',
    async (key) => {
      const t = setup('TEST ONLY audit');
      t.audit[key] = 'other';
      await expect(
        t.service.contractorUpload(user, dto, file),
      ).rejects.toThrow();
      expect(t.repo.save).not.toHaveBeenCalled();
    },
  );
  it('still rejects new uploads during an audit lock', async () => {
    const t = setup('TEST ONLY audit');
    t.audit.uploadLockFrom = '2000-01-01';
    t.audit.uploadLockUntil = '2099-12-31';
    await expect(t.service.contractorUpload(user, dto, file)).rejects.toThrow(
      'locked',
    );
    expect(t.repo.save).not.toHaveBeenCalled();
  });
  it.each(['branchId', 'contractorUserId'])(
    'rejects incomplete contractor audits even when the vendor supplies a valid %s',
    async (key) => {
      const t = setup('Actual audit');
      t.audit[key] = null;
      await expect(t.service.contractorUpload(user, dto, file))
        .rejects.toThrow('Select a branch and contractor');
      expect(t.repo.save).not.toHaveBeenCalled();
    },
  );
  it('keeps non-audit monthly uploads available', async () => {
    const t = setup('Actual audit');
    await t.service.contractorUpload(user, { ...dto, auditId: undefined }, file);
    expect(t.repo.save).toHaveBeenCalled();
  });
});
