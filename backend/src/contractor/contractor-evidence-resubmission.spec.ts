import { ContractorDocumentsService } from './contractor-documents.service';
import { ContractorDocumentEntity } from './entities/contractor-document.entity';
const at = '2026-10-19T09:00:00.000Z';
const original = {
  id: 'doc',
  contractorUserId: 'vendor',
  clientId: 'client',
  branchId: 'branch',
  docType: 'BANK_PAYMENT_PROOF',
  docMonth: '2026-05',
  status: 'REJECTED',
  filePath: 'contractor-documents/old.xlsx',
  fileName: 'old.xlsx',
  reviewedAt: new Date(at),
  reviewedByUserId: 'crm',
  reviewNotes: 'Wrong beneficiary reference',
  expiryDate: null,
  auditId: null,
  title: 'Test proof',
};
const body = {
  expectedFilePath: original.filePath,
  expectedStatus: 'REJECTED',
  expectedReviewedAt: at,
  correctionNotes: 'SYNTHETIC corrected bank reference',
};
const user = { id: 'vendor', clientId: 'client' } as any;
const file = {
  path: process.cwd() + '/uploads/contractor-documents/new.xlsx',
  originalname: 'new.xlsx',
  mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size: 500,
} as any;
function setup(doc: any = original, linked = true) {
  const docs = {
    findOne: jest.fn(async () => (doc ? { ...doc } : null)),
    save: jest.fn(async (d: any) => d),
  };
  const query = jest.fn(async (_sql: string, _params: any[]) => []);
  const transaction = jest.fn(async (fn: any) =>
    fn({
      getRepository: (entity: any) =>
        entity === ContractorDocumentEntity
          ? docs
          : { findOne: async () => (linked ? {} : null) },
      query,
    }),
  );
  const check = jest.fn(async () => {}),
    invalidateBranch = jest.fn(async () => {});
  const c: any = new ContractorDocumentsService(
    { manager: { transaction } } as any,
    {} as any,
    {} as any,
    {} as any,
    { invalidateBranch } as any,
    { check } as any,
  );
  return { c, docs, query, transaction, check };
}
describe('contractor rejected financial evidence corrections', () => {
  it('keeps the same document, scope, wage month and type and atomically records both files and correction reason', async () => {
    const { c, docs, query, transaction, check } = setup();
    const result = await c.contractorReupload(user, 'doc', body, file);
    expect(result).toMatchObject({
      id: 'doc',
      status: 'PENDING_REVIEW',
      fileName: 'new.xlsx',
      filePath: 'contractor-documents/new.xlsx',
    });
    expect(docs.save.mock.calls[0][0]).toMatchObject({
      docMonth: '2026-05',
      clientId: 'client',
      branchId: 'branch',
      docType: 'BANK_PAYMENT_PROOF',
      reviewedAt: null,
      reviewedByUserId: null,
      reviewNotes: null,
      expiryDate: null,
    });
    expect(docs.findOne).toHaveBeenCalledWith({
      where: { id: 'doc' },
      lock: { mode: 'pessimistic_write' },
    });
    const snapshot = JSON.parse(query.mock.calls[0][1][2]);
    expect(snapshot).toMatchObject({
      previous: {
        fileName: 'old.xlsx',
        filePath: original.filePath,
        reviewNotes: 'Wrong beneficiary reference',
        status: 'REJECTED',
      },
      fileName: 'new.xlsx',
      status: 'PENDING_REVIEW',
      correctionNotes: body.correctionNotes,
      period: '2026-05',
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith('doc');
  });
  it.each([
    { expectedFilePath: 'stale.xlsx' },
    { expectedStatus: 'APPROVED' },
    { expectedReviewedAt: '2026-10-18T09:00:00Z' },
  ])(
    'blocks stale correction forms without replacing evidence',
    async (change) => {
      const { c, docs } = setup();
      await expect(
        c.contractorReupload(user, 'doc', { ...body, ...change }, file),
      ).rejects.toThrow('evidence changed');
      expect(docs.save).not.toHaveBeenCalled();
    },
  );
  it.each(['APPROVED', 'PENDING_REVIEW'])(
    'does not replace %s evidence',
    async (status) => {
      const { c, docs } = setup({ ...original, status });
      await expect(
        c.contractorReupload(
          user,
          'doc',
          { ...body, expectedStatus: status },
          file,
        ),
      ).rejects.toThrow('Only rejected');
      expect(docs.save).not.toHaveBeenCalled();
    },
  );
  it.each([
    { correctionNotes: 'short' },
    { correctionNotes: 'x'.repeat(2001) },
    { expectedFilePath: undefined },
    { expectedReviewedAt: 'bad' },
  ])(
    'requires correction details and a valid current-file binding',
    async (change) => {
      const { c, docs } = setup();
      await expect(
        c.contractorReupload(user, 'doc', { ...body, ...change }, file),
      ).rejects.toThrow();
      expect(docs.save).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...original, contractorUserId: 'other' },
    { ...original, clientId: 'other' },
    null,
  ])('blocks another owner or client', async (doc) => {
    const { c, docs } = setup(doc);
    await expect(c.contractorReupload(user, 'doc', body, file)).rejects.toThrow(
      'not authorized',
    );
    expect(docs.save).not.toHaveBeenCalled();
  });
  it('requires the contractor branch mapping', async () => {
    const { c, docs } = setup(original, false);
    await expect(c.contractorReupload(user, 'doc', body, file)).rejects.toThrow(
      'mapped',
    );
    expect(docs.save).not.toHaveBeenCalled();
  });
  it('fails the transaction if the history cannot be persisted and does not run reconciliation', async () => {
    const { c, query, check } = setup();
    query.mockRejectedValueOnce(new Error('history unavailable'));
    await expect(c.contractorReupload(user, 'doc', body, file)).rejects.toThrow(
      'history unavailable',
    );
    expect(check).not.toHaveBeenCalled();
  });
  it('preserves nonfinancial replacement compatibility', async () => {
    const { c } = setup({ ...original, docType: 'SAFETY' });
    await expect(
      c.contractorReupload(user, 'doc', {}, file),
    ).resolves.toMatchObject({ status: 'PENDING_REVIEW' });
  });
});
it('retains the explicit test classification during correction', async () => {
  const { c, docs } = setup({ ...original, fileName: 'TEST-ONLY-old.xlsx' });
  await expect(c.contractorReupload(user, 'doc', body, file)).rejects.toThrow(
    'Keep test evidence separate',
  );
  expect(docs.save).not.toHaveBeenCalled();
});
