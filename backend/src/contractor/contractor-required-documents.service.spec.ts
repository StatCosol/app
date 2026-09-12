import { ContractorRequiredDocumentsService } from './contractor-required-documents.service';

describe('Contractor monthly checklist branch scope', () => {
  function setup() {
    const required = [
      { id: 'a-extra', docType: 'EXTRA', branchId: 'a' },
      { id: 'b-extra', docType: 'EXTRA', branchId: 'b' },
      { id: 'global', docType: 'GLOBAL_EXTRA', branchId: null },
    ];
    const uploads = [
      {
        id: 'upload-a',
        doc_type: 'WAGE_REGISTER',
        branch_id: 'a',
        status: 'APPROVED',
      },
      {
        id: 'extra-a',
        doc_type: 'EXTRA',
        branch_id: 'a',
        status: 'PENDING_REVIEW',
      },
      {
        id: 'unassigned',
        doc_type: 'PF_CHALLAN',
        branch_id: null,
        status: 'APPROVED',
      },
    ];
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ exists: 1 }])
      .mockResolvedValue(uploads);
    const repo = {
      find: jest.fn().mockResolvedValue(required),
      manager: { query },
    };
    const mappings = {
      find: jest.fn().mockResolvedValue([{ branchId: 'a' }, { branchId: 'b' }]),
    };
    const service = new ContractorRequiredDocumentsService(
      repo as any,
      {} as any,
      mappings as any,
    );
    return { service, mappings };
  }

  it('keeps standards and custom requirements separate for each mapped branch', async () => {
    const { service, mappings } = setup();
    const result = await service.getContractorChecklist(
      'contractor',
      'client',
      '2026-08',
    );
    expect(mappings.find).toHaveBeenCalledWith({
      where: { contractorUserId: 'contractor', clientId: 'client' },
      select: ['branchId'],
    });
    expect(result.items).toHaveLength(16);
    expect(new Set(result.items.map((i) => i.id)).size).toBe(16);
    for (const type of ['WAGE_REGISTER', 'EXTRA']) {
      expect(
        result.items.find((i) => i.docType === type && i.branchId === 'a')
          ?.uploaded,
      ).toBe(true);
      expect(
        result.items.find((i) => i.docType === type && i.branchId === 'b')
          ?.uploaded,
      ).toBe(false);
    }
    expect(
      result.items
        .filter((i) => i.docType === 'PF_CHALLAN')
        .every((i) => !i.uploaded),
    ).toBe(true);
  });

  it('returns only the selected branch without accepting another branch upload', async () => {
    const { service } = setup();
    const result = await service.getContractorChecklist(
      'contractor',
      'client',
      '2026-08',
      'b',
    );
    expect(result.items).toHaveLength(8);
    expect(result.items.every((i) => i.branchId === 'b' && !i.uploaded)).toBe(
      true,
    );
  });
});
