import 'reflect-metadata';
import fs = require('fs');
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BranchComplianceService } from './branch-compliance.service';
import { CrmDocumentsService } from '../crm-documents/crm-documents.service';
import { ClientComplianceDocsController } from '../compliance-documents/client-compliance-docs.controller';
import { ComplianceDocumentsService } from '../compliance-documents/compliance-documents.service';

const user = {
  id: 'u',
  userId: 'u',
  roleCode: 'CLIENT',
  userType: 'BRANCH',
  clientId: 'company-a',
  branchIds: ['branch-a'],
} as any;
const file = {
  originalname: 'return.pdf',
  mimetype: 'application/pdf',
  buffer: Buffer.from('%PDF-1.7'),
};
function setup(existing: any = null, frequency = 'MONTHLY') {
  const repo = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ id: 'doc-a', ...x })),
  };
  const master = {
    returnCode: 'PT',
    returnName: 'PT return',
    frequency,
    lawArea: 'PT',
    dueDay: 31,
    isActive: true,
  };
  const query = jest.fn(async (sql: string) =>
    sql.includes('crm_on_behalf_enabled')
      ? [{ crm_on_behalf_enabled: true }]
      : [{ id: 'branch-a' }],
  );
  const svc = new BranchComplianceService(
    repo as any,
    { findOne: jest.fn().mockResolvedValue(master) } as any,
    { getUserBranchIds: jest.fn().mockResolvedValue(['branch-a']) } as any,
    { query } as any,
    { log: jest.fn().mockResolvedValue(undefined) } as any,
    {} as any,
    {} as any,
  );
  const find = jest
    .spyOn(svc as any, 'findExistingDoc')
    .mockResolvedValue(existing);
  const saveFile = jest
    .spyOn(svc as any, 'saveFile')
    .mockResolvedValue('/uploads/compliance/company-a/branch-a/new.pdf');
  return { svc, repo, master, query, find, saveFile };
}
describe('compliance document lifecycle', () => {
  it.each([
    ['MONTHLY', { periodMonth: 1 }, '2026-02-28'],
    ['QUARTERLY', { periodQuarter: 4 }, '2027-01-31'],
    ['HALF_YEARLY', { periodHalf: 1 }, '2026-10-31'],
    ['HALF_YEARLY', { periodHalf: 2 }, '2027-04-30'],
    ['YEARLY', {}, '2027-04-30'],
  ])(
    'saves %s to a real calendar date and the requested period',
    async (frequency, period, dueDate) => {
      const { svc, find } = setup(null, frequency);
      const dto = {
        branchId: 'branch-a',
        returnCode: 'PT',
        periodYear: 2026,
        frequency,
        ...period,
      } as any;
      const result = await svc.uploadDocument(user, dto, file);
      expect(result).toMatchObject({
        ...dto,
        dueDate,
        status: 'SUBMITTED',
        moduleSource: 'BRANCHDESK',
        uploadedByRole: 'BRANCH',
      });
      expect(find).toHaveBeenCalledWith(
        'branch-a',
        'company-a',
        'PT',
        frequency,
        2026,
        dto.periodMonth,
        dto.periodQuarter,
        dto.periodHalf,
      );
    },
  );
  it('uses the configured annual fixed due date', async () => {
    const { svc, master } = setup(null, 'YEARLY');
    (master as any).dueDateRule = 'BEFORE_31_JAN';
    const doc = await svc.uploadDocument(
      user,
      {
        branchId: 'branch-a',
        returnCode: 'PT',
        periodYear: 2026,
        frequency: 'YEARLY',
      },
      file,
    );
    expect(doc.dueDate).toBe('2027-01-31');
  });
  it('clamps February correctly in a leap year', async () => {
    const { svc } = setup();
    const doc = await svc.uploadDocument(
      user,
      {
        branchId: 'branch-a',
        returnCode: 'PT',
        periodYear: 2028,
        frequency: 'MONTHLY',
        periodMonth: 1,
      },
      file,
    );
    expect(doc.dueDate).toBe('2028-02-29');
  });
  it('records branch ownership when a branch resubmits a returned CRM upload', async () => {
    const { svc } = setup({
      id: 'existing',
      version: 2,
      isLocked: false,
      status: 'REUPLOAD_REQUIRED',
      moduleSource: 'CRM',
      uploadedByRole: 'CRM',
      actingOnBehalf: true,
    });
    const doc = await svc.uploadDocument(
      user,
      {
        branchId: 'branch-a',
        returnCode: 'PT',
        periodYear: 2026,
        frequency: 'MONTHLY',
        periodMonth: 10,
      },
      file,
    );
    expect(doc).toMatchObject({
      id: 'existing',
      version: 3,
      status: 'RESUBMITTED',
      moduleSource: 'BRANCHDESK',
      uploadedByRole: 'BRANCH',
      actingOnBehalf: false,
      reviewedAt: null,
    });
  });
  it('does not write a replacement for an approved document', async () => {
    const { svc, saveFile, repo } = setup({
      isLocked: true,
      status: 'APPROVED',
    });
    await expect(
      svc.uploadDocument(
        user,
        {
          branchId: 'branch-a',
          returnCode: 'PT',
          periodYear: 2026,
          frequency: 'MONTHLY',
          periodMonth: 10,
        },
        file,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(saveFile).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('removes a new file when the database rejects its record', async () => {
    const { svc, repo } = setup();
    repo.save.mockRejectedValueOnce(new Error('database unavailable'));
    const unlink = jest
      .spyOn(fs, 'unlinkSync')
      .mockImplementation(() => undefined);
    try {
      await expect(
        svc.uploadDocument(
          user,
          {
            branchId: 'branch-a',
            returnCode: 'PT',
            periodYear: 2026,
            frequency: 'MONTHLY',
            periodMonth: 10,
          },
          file,
        ),
      ).rejects.toThrow('database unavailable');
      expect(unlink).toHaveBeenCalledWith(
        expect.stringMatching(
          /uploads[\\/]compliance[\\/]company-a[\\/]branch-a[\\/]new.pdf$/,
        ),
      );
    } finally {
      unlink.mockRestore();
    }
  });
  it('rejects a quarterly N/A action without its quarter', async () => {
    const { svc, find } = setup(null, 'QUARTERLY');
    await expect(
      svc.markNotApplicable(user, {
        branchId: 'branch-a',
        returnCode: 'PT',
        periodYear: 2026,
        frequency: 'QUARTERLY',
        remarks: 'Not applicable',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(find).not.toHaveBeenCalled();
  });
  it('requires CRM assignment and the existing client permission', async () => {
    const { svc, query, saveFile } = setup();
    query.mockImplementation(async (sql) =>
      sql.includes('crm_on_behalf_enabled')
        ? ([{ crm_on_behalf_enabled: false }] as any)
        : [{ id: 'branch-a' }],
    );
    await expect(
      svc.crmUploadOnBehalf(
        { ...user, roleCode: 'CRM' },
        {
          companyId: 'company-a',
          branchId: 'branch-a',
          returnCode: 'PT',
          periodYear: 2026,
          frequency: 'MONTHLY',
          periodMonth: 10,
        },
        file,
      ),
    ).rejects.toThrow('not enabled');
    expect(saveFile).not.toHaveBeenCalled();
  });
});

describe('unit document download boundaries', () => {
  function setupDoc() {
    const doc = {
      id: 'd',
      branchId: 'branch-a',
      clientId: 'company-a',
      filePath: 'unit/report.pdf',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
    };
    const assignments = { findOne: jest.fn().mockResolvedValue({}) };
    const svc = new CrmDocumentsService(
      { findOne: jest.fn().mockResolvedValue(doc) } as any,
      assignments as any,
    );
    return { doc, svc, assignments };
  }
  it.each([
    ['CLIENT', { clientId: 'company-b' }],
    [
      'BRANCH_USER',
      { allowedBranchIds: ['branch-b'], allowedClientIds: ['company-a'] },
    ],
    ['BRANCH_USER', { allowedBranchIds: [], allowedClientIds: [] }],
    ['UNKNOWN', {}],
  ])('denies mismatched access for %s', async (role, opts) => {
    const { svc } = setupDoc();
    await expect(
      svc.getDocumentForDownload('d', 'u', role, opts as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each([
    ['CLIENT', { clientId: 'company-a' }],
    [
      'BRANCH_USER',
      { allowedBranchIds: ['branch-a'], allowedClientIds: ['company-a'] },
    ],
    ['CRM', {}],
  ])(
    'lets the intended %s user download the same stored record',
    async (role, opts) => {
      const { svc } = setupDoc();
      const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      try {
        expect(
          await svc.getDocumentForDownload('d', 'u', role, opts as any),
        ).toMatchObject({
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
        });
      } finally {
        exists.mockRestore();
      }
    },
  );
  it('does not grant access to a CRM assigned to another client', async () => {
    const { svc, assignments } = setupDoc();
    assignments.findOne.mockResolvedValue(null);
    await expect(
      svc.getDocumentForDownload('d', 'u', 'CRM'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('legacy reference library branch scope', () => {
  function makeService() {
    const qb = {
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const repo = {
      createQueryBuilder: () => qb,
      findOne: jest.fn().mockResolvedValue({
        id: 'd',
        clientId: 'company-a',
        branchId: 'branch-a',
      }),
    };
    const svc = new ComplianceDocumentsService(
      repo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        isMasterUser: jest.fn().mockResolvedValue(true),
        getUserBranchIds: jest.fn().mockResolvedValue([]),
      } as any,
    );
    return { svc, qb };
  }
  it('does not treat a branch user with revoked mappings as a master', async () => {
    const { svc, qb } = makeService();
    expect(await svc.listForClient('company-a', 'u', {}, 'BRANCH')).toEqual([]);
    expect(qb.getMany).not.toHaveBeenCalled();
    await expect(
      svc.getDocumentForDownload('d', 'u', 'CLIENT', 'company-a', 'BRANCH'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('branch roles without active mappings', () => {
  it.each(['BRANCH', 'BRANCH_DESK'])(
    'denies %s upload access with no branch mapping',
    async (roleCode) => {
      const svc = new BranchComplianceService(
        {} as any,
        {} as any,
        { getUserBranchIds: jest.fn().mockResolvedValue([]) } as any,
        { query: jest.fn().mockResolvedValue([]) } as any,
        {} as any,
        {} as any,
        {} as any,
      );
      await expect(
        svc.assertBranchAccess(
          { ...user, roleCode, userType: undefined },
          'branch-a',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it.each([
    { roleCode: 'CLIENT', userType: 'BRANCH' },
    { roleCode: 'BRANCH' },
    { roleCode: 'BRANCH_DESK' },
  ])('denies branch changes to company permissions: %j', async (identity) => {
    const service = { updateCompanySettings: jest.fn() };
    const controller = new ClientComplianceDocsController(service as any);
    await expect(
      controller.updateSettings(
        { ...user, userType: undefined, ...identity },
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.updateCompanySettings).not.toHaveBeenCalled();
  });
});
