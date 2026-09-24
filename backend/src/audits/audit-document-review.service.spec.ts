import { AuditDocumentReviewService } from './audit-document-review.service';

describe('Audit document review scope and remarks', () => {
  const audit = {
    id: 'audit',
    assignedAuditorId: 'auditor',
    clientId: 'client',
    branchId: 'branch',
    contractorUserId: 'contractor',
    periodCode: '2026-08',
    periodYear: 2026,
    auditType: 'CONTRACTOR',
    status: 'IN_PROGRESS',
  };
  const user = { userId: 'auditor', roleCode: 'AUDITOR' } as any;
  function setup(reviews: any[] = []) {
    const repo = { findOne: jest.fn().mockResolvedValue({ ...audit }) };
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('FROM branch_documents bd'))
        return [
          {
            id: 'branch-doc',
            sourceTable: 'branch_documents',
            status: 'APPROVED',
            reviewNotes: 'Upstream remark',
          },
        ];
      if (sql.includes('FROM contractor_documents cd'))
        return [
          {
            id: 'vendor-doc',
            sourceTable: 'contractor_documents',
            status: 'APPROVED',
            reviewNotes: 'Another audit remark',
          },
        ];
      return [];
    });
    const reviewRepo = {
      find: jest.fn().mockResolvedValue(reviews),
      save: jest.fn(),
    };
    const checklistRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
    };
    const service = new AuditDocumentReviewService(
      repo as any,
      {} as any,
      checklistRepo as any,
      reviewRepo as any,
      {} as any,
      { query } as any,
      {} as any,
      { getForAuditor: jest.fn().mockResolvedValue(audit) } as any,
      {} as any,
      {} as any,
    );
    return { service, repo, query, reviewRepo, checklistRepo };
  }
  it('stores linked document suggestions separately from manual checkpoint remarks', async () => {
    const { service, query, checklistRepo } = setup();
    query.mockResolvedValue([{ docType: 'PF_CHALLAN', fileName: 'pf.pdf' }]);
    const item = {
      itemLabel: 'PF Challan',
      docType: 'PF_CHALLAN',
      status: 'PENDING',
      remarks: 'My saved observation',
      automatedRemarks: 'Old suggestion',
      automationReviewed: true,
    };
    checklistRepo.find.mockResolvedValue([item]);
    await (service as any).autoLinkChecklistItem(
      'audit',
      'doc',
      'contractor_documents',
      'COMPLIED',
      'New document remark',
      'auditor',
    );
    expect(checklistRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        remarks: 'My saved observation',
        automatedRemarks: 'New document remark',
        automationReviewed: false,
      }),
    );
  });
  it('restores this audit remark and requires review of upstream-approved uploads', async () => {
    const { service, query } = setup([
      {
        documentId: 'vendor-doc',
        sourceTable: 'contractor_documents',
        complianceMark: 'NON_COMPLIED',
        auditorRemark: 'Verified amount mismatch',
        reviewedBy: 'auditor',
      },
    ]);
    const documents = await service.listDocumentsForAudit(user, 'audit');
    expect(documents.contractorDocuments[0].reviewNotes).toBe(
      'Verified amount mismatch',
    );
    expect(documents.contractorDocuments[0].status).toBe('REJECTED');
    expect(documents.branchDocuments[0].status).toBe('SUBMITTED');
    expect(documents.branchDocuments[0].reviewNotes).toBe('');
    const contractorQuery = query.mock.calls.find(([sql]) =>
      sql.includes('FROM contractor_documents cd'),
    );
    expect(contractorQuery?.[1]).toEqual([
      'client',
      'contractor',
      'branch',
      'audit',
      '2026-08',
    ]);
  });
  it('rejects documents outside the loaded branch/contractor/period before writes', async () => {
    const { service, query, reviewRepo } = setup();
    await expect(
      service.reviewDocumentForAudit(
        user,
        'audit',
        'foreign-doc',
        'COMPLIED',
        'Checked',
        'contractor_documents',
      ),
    ).rejects.toThrow('not in this audit');
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE'))).toBe(
      false,
    );
    expect(reviewRepo.save).not.toHaveBeenCalled();
  });
  it('keeps closed audits read-only and rejects invalid document sources', async () => {
    const { service, repo, query } = setup();
    repo.findOne.mockResolvedValueOnce({ ...audit, status: 'CLOSED' });
    await expect(
      service.reviewDocumentForAudit(user, 'audit', 'vendor-doc', 'COMPLIED'),
    ).rejects.toThrow('read-only');
    await expect(
      service.reviewDocumentForAudit(
        user,
        'audit',
        'vendor-doc',
        'COMPLIED',
        'Checked',
        'other_table',
      ),
    ).rejects.toThrow('Invalid document source');
    expect(query).not.toHaveBeenCalled();
  });
});
