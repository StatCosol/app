import { CrmContractorDocumentsController } from './crm-contractor-documents.controller';

const reviewer = { id: 'TEST-CRM' } as any;
const binding = {
  status: 'APPROVED',
  expectedFilePath: 'TEST-ONLY-original.pdf',
  expectedStatus: 'PENDING_REVIEW',
  expectedReviewedAt: null,
};
function setup(
  current = {
    filePath: binding.expectedFilePath,
    status: 'PENDING_REVIEW',
    reviewedAt: null as string | null,
  },
) {
  const many = jest.fn(async (sql: string, params: any[]) => {
    if (!/UPDATE contractor_documents/i.test(sql)) return [{ id: 'TEST-DOC' }];
    // Model the conditional UPDATE's database compare-and-set contract. An
    // unconditional ID-only update deliberately reproduces the old defect.
    if (
      /file_path\s*=\s*\$5/i.test(sql) &&
      (current.filePath !== params[4] ||
        current.status !== params[5] ||
        current.reviewedAt !== params[6])
    )
      return [];
    current.status = params[0];
    current.reviewedAt = '2026-11-14T00:00:00.000Z';
    return [{ id: 'TEST-DOC' }];
  });
  return {
    controller: new CrmContractorDocumentsController({ many } as any),
    many,
    current,
  };
}
describe('CRM contractor evidence review version binding', () => {
  it('rejects approval of a corrected replacement from a stale document tab', async () => {
    const { controller, current } = setup({
      filePath: 'TEST-ONLY-corrected.pdf',
      status: 'PENDING_REVIEW',
      reviewedAt: null,
    });
    await expect(
      controller.review(reviewer, 'TEST-DOC', binding as any),
    ).rejects.toThrow('changed');
    expect(current.status).toBe('PENDING_REVIEW');
  });
  it('allows only one of two reviewers with the same pending snapshot to change the document', async () => {
    const { controller, current } = setup();
    const results = await Promise.allSettled([
      controller.review(reviewer, 'TEST-DOC', binding as any),
      controller.review(reviewer, 'TEST-DOC', {
        ...binding,
        status: 'REJECTED',
      } as any),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(current.status).toBe('APPROVED');
  });
  it.each([
    { status: 'APPROVED' },
    { ...binding, expectedReviewedAt: 'not-a-date' },
    { ...binding, expectedReviewedAt: '123' },
    { ...binding, expectedReviewedAt: '2026-02-30T12:00:00Z' },
    { ...binding, expectedStatus: 'invented' },
  ])(
    'rejects missing or invalid review binding before any database mutation',
    async (body) => {
      const { controller, many } = setup();
      await expect(
        controller.review(reviewer, 'TEST-DOC', body as any),
      ).rejects.toThrow();
      expect(
        many.mock.calls.filter(([sql]) => /UPDATE/.test(sql)),
      ).toHaveLength(0);
    },
  );
  it('binds the update to file, prior status, review timestamp and the current CRM assignment', async () => {
    const { controller, many } = setup();
    await expect(
      controller.review(reviewer, 'TEST-DOC', binding as any),
    ).resolves.toEqual({ ok: true });
    const update = many.mock.calls.find(([sql]) => /UPDATE/.test(sql))!;
    expect(update[0]).toContain('client_assignments_current');
    expect(update[0]).toMatch(/file_path\s*=\s*\$5/i);
    expect(update[0]).toMatch(/status::text\s*=\s*\$6::text/i);
    expect(update[0]).toMatch(/reviewed_at\s+IS NOT DISTINCT FROM\s+\$7/i);
    expect(update[1].slice(4)).toEqual([
      binding.expectedFilePath,
      binding.expectedStatus,
      null,
    ]);
  });
});
