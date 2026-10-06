import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReqUser } from '../access/access-scope.service';
import { LegitxAssistantDocumentsService } from './legitx-assistant-documents.service';
import { documentIntent } from './assistant-document-intent';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  AssistantDocumentDto,
  AssistantDocumentViewDto,
} from './dto/assistant-document.dto';

const user: ReqUser = {
  id: 'user',
  userId: 'user',
  roleCode: 'CLIENT',
  userType: 'MASTER',
  clientId: 'company',
  branchIds: [],
  email: '',
  employeeId: null,
  assignedClientIds: [],
};
function setup(master = true) {
  const scope = {
    resolve: jest.fn().mockResolvedValue({
      clientId: 'company',
      branchId: null,
      allowedBranchIds: master ? 'ALL' : ['branch'],
    }),
  };
  const library = {
    listForClient: jest.fn().mockResolvedValue([]),
    getDocumentForDownload: jest.fn(),
    upload: jest.fn(),
    softDelete: jest.fn(),
  };
  const payroll = {
    listEmployeeRecords: jest.fn().mockResolvedValue({ records: [] }),
    downloadPayslip: jest.fn(),
    downloadFnfDocument: jest.fn(),
  };
  const branches = { isMasterUser: jest.fn().mockResolvedValue(master) };
  const audit = { log: jest.fn().mockResolvedValue({}) };
  const db = { query: jest.fn().mockResolvedValue([]) };
  const entitlements = { assertModule: jest.fn().mockResolvedValue(undefined) };
  const audits = {
    listNcsForVendor: jest.fn().mockResolvedValue({ items: [] }),
  };
  const files = { assertCanDownload: jest.fn().mockResolvedValue(undefined) };
  const service = new LegitxAssistantDocumentsService(
    scope as any,
    library as any,
    payroll as any,
    branches as any,
    audit as any,
    db as any,
    entitlements as any,
    audits as any,
    files as any,
  );
  return {
    service,
    scope,
    library,
    payroll,
    audit,
    db,
    entitlements,
    audits,
    files,
  };
}
const license = {
  id: 'doc',
  clientId: 'company',
  category: 'LICENSE',
  subCategory: 'SHOPS',
  branchId: 'branch',
  title: 'Registration',
  periodYear: null,
  periodMonth: null,
};

describe('Assist read-only document intent', () => {
  it.each([
    'upload PF challan',
    'show PF challan and approve it',
    'show PF challan for another company',
    'show salary and change HRA',
    'show contractor ABC pending documents and approve them',
    'Show PF challan for August 2025 2026',
    'Show PF challan for last month 2025',
    'show audit evidence',
  ])('refuses unsupported or mutating request %s', (request) => {
    expect(documentIntent(request)).toBeNull();
  });
  it.each([
    ["Show Ravi Kumar's payslip for August 2026", 'PAYSLIP', 8, 2026],
    [
      'Open Ravi Kumar’s F&F settlement statement for August 2025.',
      'FNF',
      8,
      2025,
    ],
    ['Find Ravi Kumar payslip August 2026', 'PAYSLIP', 8, 2026],
    ["View Ravi Kumar's payslip for August", 'PAYSLIP', 8, undefined],
    ["Show Ravi Kumar's F&F for 2025", 'FNF', undefined, 2025],
    [
      "Show Ravi Kumar's payslip for last month",
      'PAYSLIP',
      undefined,
      undefined,
    ],
  ])(
    'extracts employee document period from %s',
    (request, kind, month, year) => {
      expect(documentIntent(request)).toMatchObject({
        kind,
        employeeName: 'Ravi Kumar',
        month,
        year,
        latest: false,
      });
    },
  );
  it.each([
    "Show Ravi Kumar's payslip for August 2025 2026",
    "Show Ravi Kumar's payslip for August September 2026",
    "Show Ravi Kumar's payslip for last month 2025",
    "Show Ravi Kumar's latest payslip for August 2026",
    "Show Ravi Kumar's payslip for August 2026 and approve it",
    "Show Ravi Kumar's payslip for another company",
  ])('rejects conflicting or unsupported employee period %s', (request) => {
    expect(documentIntent(request)).toBeNull();
  });
  it('extracts employee, month, year and branch without an AI provider', () => {
    expect(documentIntent("Show Ravi Kumar's last payslip")).toMatchObject({
      kind: 'PAYSLIP',
      employeeName: 'Ravi Kumar',
      latest: true,
    });
    expect(documentIntent('Open the PF challan for August 2026')).toMatchObject(
      { category: 'RETURN', subCategory: 'PF', month: 8, year: 2026 },
    );
    expect(
      documentIntent(
        'Show the Shops and Establishment registration for Hyderabad branch',
      ),
    ).toMatchObject({
      category: 'LICENSE',
      subCategory: 'SHOPS',
      branchName: 'Hyderabad',
    });
    expect(documentIntent('Show Form A bonus register')).toMatchObject({
      category: 'REGISTER',
      subCategory: 'BONUS',
    });
  });
});

describe('LegitX Assist document permissions', () => {
  afterEach(() => jest.restoreAllMocks());
  it('never accepts an assigned-client role through the LegitX endpoint', async () => {
    const { service, scope, db } = setup();
    await expect(
      service.find(
        { ...user, roleCode: 'PAYDEK' },
        { request: 'Show PF challan' },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(scope.resolve).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });
  it('resolves scope before any document query and propagates forbidden filters', async () => {
    const { service, scope, library } = setup();
    scope.resolve.mockRejectedValue(new ForbiddenException());
    await expect(
      service.find(user, { request: 'Show PF challan', branchId: 'foreign' }),
    ).rejects.toThrow(ForbiddenException);
    expect(library.listForClient).not.toHaveBeenCalled();
  });
  it.each([
    "Show Ravi Kumar's appointment letter",
    "Show Ravi Kumar's last payslip",
    'Show Form A bonus register',
    'Show audit report',
    'Show PF challan',
  ])('does not reveal sensitive metadata to branches: %s', async (request) => {
    const { service, library, db, payroll } = setup(false);
    const result = await service.find(
      { ...user, userType: 'BRANCH' },
      { request },
    );
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.documents).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
    expect(library.listForClient).not.toHaveBeenCalled();
    expect(payroll.listEmployeeRecords).not.toHaveBeenCalled();
  });
  it('filters other branches and company-level documents from branch results', async () => {
    const { service, library } = setup(false);
    library.listForClient.mockResolvedValue([
      license,
      { ...license, id: 'foreign', branchId: 'other' },
      { ...license, id: 'companyDoc', branchId: null },
    ]);
    const result = await service.find(
      { ...user, userType: 'BRANCH' },
      { request: 'Show shops registration' },
    );
    expect(result.status).toBe('EXACT');
    expect(result.documents.map((doc) => doc.id)).toEqual(['doc']);
  });
  it('returns exact, safe shortlist and unavailable outcomes with recorded source', async () => {
    const { service, library, audit } = setup();
    expect(
      (await service.find(user, { request: 'Show shops registration' })).status,
    ).toBe('UNAVAILABLE');
    library.listForClient.mockResolvedValue([license]);
    expect(
      await service.find(user, { request: 'Show shops registration' }),
    ).toMatchObject({
      status: 'EXACT',
      sourceLabel: 'Recorded data',
      readOnly: true,
    });
    library.listForClient.mockResolvedValue([
      license,
      { ...license, id: 'second' },
    ]);
    const result = await service.find(user, {
      request: 'Show shops registration',
    });
    expect(result.status).toBe('SHORTLIST');
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0]).not.toHaveProperty('filePath');
    expect(result.documents[0]).not.toHaveProperty('uploadedBy');
    expect(library.upload).not.toHaveBeenCalled();
    expect(library.softDelete).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
  it('uses explicit request month/year over dashboard period', async () => {
    const { service, library } = setup();
    await service.find(user, {
      request: 'Show PF challan for August 2025',
      month: 10,
      year: 2026,
    });
    expect(library.listForClient).toHaveBeenCalledWith(
      'company',
      'user',
      expect.objectContaining({
        periodMonth: 8,
        periodYear: 2025,
        subCategory: 'PF',
      }),
    );
  });
  it('does not open a unique file for an ambiguous employee name', async () => {
    const { service, db } = setup();
    db.query
      .mockResolvedValueOnce([
        { id: 'one', name: 'Ravi Kumar', branch_id: 'branch' },
        { id: 'two', name: 'Ravi Kumar', branch_id: 'other' },
      ])
      .mockResolvedValueOnce([
        { id: 'letter', doc_name: 'Appointment', created_at: '2026-08-01' },
      ])
      .mockResolvedValueOnce([]);
    expect(
      (
        await service.find(user, {
          request: "Show Ravi Kumar's appointment letter",
        })
      ).status,
    ).toBe('SHORTLIST');
  });
  it('rechecks permission on forged or stale document links before loading a file', async () => {
    const { service, library, audit } = setup(false);
    library.listForClient.mockResolvedValue([
      { ...license, branchId: 'other' },
    ]);
    await expect(
      service.view({ ...user, userType: 'BRANCH' }, 'LIBRARY', 'doc', {}),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.view({ ...user, userType: 'BRANCH' }, 'EMPLOYEE', 'doc', {}),
    ).rejects.toThrow(NotFoundException);
    expect(library.getDocumentForDownload).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
  it('records access before returning a file and fails closed if logging fails', async () => {
    const { service, library, audit } = setup();
    library.listForClient.mockResolvedValue([license]);
    library.getDocumentForDownload.mockResolvedValue({
      absolutePath: 'stored-file',
      fileName: 'registration.pdf',
      mimeType: 'application/pdf',
    });
    jest
      .spyOn(service as any, 'readStoredFile')
      .mockReturnValue(Buffer.from('file'));
    expect(
      (await service.view(user, 'LIBRARY', 'doc', {})).buffer.toString(),
    ).toBe('file');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'doc',
        action: 'DOCUMENT_VIEWED',
        performedBy: 'user',
      }),
    );
    audit.log.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(service.view(user, 'LIBRARY', 'doc', {})).rejects.toThrow(
      'audit unavailable',
    );
    expect(library.upload).not.toHaveBeenCalled();
    expect(library.softDelete).not.toHaveBeenCalled();
  });
  it('rechecks selected branch for payroll links before invoking the existing reader', async () => {
    const { service, scope, db, payroll } = setup();
    scope.resolve.mockResolvedValue({
      clientId: 'company',
      branchId: 'branch',
      allowedBranchIds: 'ALL',
    });
    db.query.mockResolvedValue([{ branch_id: 'other' }]);
    await expect(
      service.view(user, 'PAYSLIP', 'run', {
        employeeCode: 'EMP1',
        branchId: 'branch',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(payroll.downloadPayslip).not.toHaveBeenCalled();
  });
  it.each([
    'Show PF challan',
    "Show Ravi Kumar's last payslip",
    'Show Form A bonus register',
    'Show audit report',
  ])(
    'requires the document module entitlement before retrieval: %s',
    async (request) => {
      const { service, entitlements, library, payroll, db } = setup();
      entitlements.assertModule.mockImplementation(
        async (_company: string, module: string) => {
          if (module !== 'EMPLOYEE_COMPLIANCE')
            throw new ForbiddenException('Module unavailable');
        },
      );
      await expect(service.find(user, { request })).rejects.toThrow(
        ForbiddenException,
      );
      expect(library.listForClient).not.toHaveBeenCalled();
      expect(payroll.listEmployeeRecords).not.toHaveBeenCalled();
      expect(db.query).not.toHaveBeenCalled();
    },
  );
  it('returns the latest published payslip via the existing payroll reader and SELECT queries only', async () => {
    const { service, db, payroll } = setup();
    db.query
      .mockResolvedValueOnce([
        {
          id: 'employee',
          name: 'Ravi Kumar',
          employee_code: 'EMP1',
          branch_id: 'branch',
        },
      ])
      .mockResolvedValueOnce([{ period_year: 2026, period_month: 7 }]);
    payroll.listEmployeeRecords.mockResolvedValue({
      records: [
        {
          employeeId: 'employee',
          employeeCode: 'EMP1',
          runId: 'run',
          payslipAvailable: true,
          runStatus: 'APPROVED',
        },
      ],
    });
    const result = await service.find(user, {
      request: "Show Ravi Kumar's last payslip",
      month: 10,
      year: 2026,
    });
    expect(result.status).toBe('EXACT');
    expect(result.documents[0].period).toBe('2026-07');
    expect(payroll.listEmployeeRecords).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ periodMonth: 7, periodYear: 2026 }),
    );
    for (const [sql] of db.query.mock.calls)
      expect(sql.trim()).toMatch(/^SELECT\b/i);
    expect(payroll.downloadPayslip).not.toHaveBeenCalled();
  });
  it('never synthesizes a missing F&F file', async () => {
    const { service, db, payroll } = setup();
    db.query
      .mockResolvedValueOnce([{ branch_id: 'branch' }])
      .mockResolvedValueOnce([]);
    await expect(service.view(user, 'FNF', 'fnf', {})).rejects.toThrow(
      NotFoundException,
    );
    expect(payroll.downloadFnfDocument).not.toHaveBeenCalled();
  });
  it('does not mistake an ordinary PF return or a different bonus form for the requested document', async () => {
    const { service, library } = setup();
    library.listForClient.mockResolvedValue([
      {
        ...license,
        category: 'RETURN',
        subCategory: 'PF',
        title: 'Monthly PF return',
      },
    ]);
    expect(
      (await service.find(user, { request: 'Show PF challan' })).status,
    ).toBe('UNAVAILABLE');
    library.listForClient.mockResolvedValue([
      {
        ...license,
        category: 'REGISTER',
        subCategory: 'BONUS',
        title: 'Form C bonus register',
      },
    ]);
    expect(
      (await service.find(user, { request: 'Show Form A bonus register' }))
        .status,
    ).toBe('UNAVAILABLE');
  });
  it('validates the employee code on the authenticated view request without rejecting it as an unknown field', () => {
    const query = plainToInstance(AssistantDocumentViewDto, {
      employeeCode: 'EMP1',
    });
    expect(
      validateSync(query, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(
      validateSync(
        plainToInstance(AssistantDocumentDto, { request: 'x', month: 99 }),
      ),
    ).toHaveLength(2);
  });
  it.each([
    'Show PF challan for August 2025 2026',
    'Show PF challan for last month 2025',
  ])(
    'rejects conflicting periods without retrieving or auto-opening: %s',
    async (request) => {
      const { service, library, db } = setup();
      expect((await service.find(user, { request })).status).toBe(
        'UNSUPPORTED',
      );
      expect(library.listForClient).not.toHaveBeenCalled();
      expect(db.query).not.toHaveBeenCalled();
    },
  );
  it('finds only stored pending contractor documents under company, branch and contractor filters', async () => {
    const { service, db, entitlements } = setup();
    db.query
      .mockResolvedValueOnce([{ id: 'contractor', branch_id: 'branch' }])
      .mockResolvedValue([
        {
          id: 'file',
          title: 'PF evidence',
          branch_id: 'branch',
          contractor_id: 'contractor',
          name: 'ABC',
          user_code: 'C1',
          doc_month: '2026-08',
          status: 'PENDING_REVIEW',
        },
      ]);
    const result = await service.find(user, {
      request: "Show contractor ABC's pending documents",
      contractorId: 'contractor',
      month: 8,
      year: 2026,
    });
    expect(result.status).toBe('EXACT');
    expect(result.documents[0]).toMatchObject({
      kind: 'CONTRACTOR',
      contractorId: 'contractor',
      status: 'PENDING_REVIEW',
    });
    expect(result.documents[0]).not.toHaveProperty('file_path');
    expect(entitlements.assertModule).toHaveBeenCalledWith(
      'company',
      'CONTRACTOR_DOCUMENTS',
    );
    expect(db.query.mock.calls[1][1]).toEqual([
      'company',
      'ABC',
      'contractor',
      null,
      '2026-08',
      true,
    ]);
    expect(db.query.mock.calls[1][0]).toContain(
      "IN ('UPLOADED', 'PENDING_REVIEW')",
    );
  });
  it('does not return or query sensitive contractor/evidence files to a branch account', async () => {
    const { service, db, audits, files } = setup(false);
    for (const request of [
      'Show contractor ABC documents',
      'Show evidence for this non-compliance',
    ]) {
      expect(
        (await service.find({ ...user, userType: 'BRANCH' }, { request }))
          .status,
      ).toBe('UNAVAILABLE');
    }
    for (const kind of ['CONTRACTOR', 'AUDIT_EVIDENCE'])
      await expect(
        service.view({ ...user, userType: 'BRANCH' }, kind, 'file', {}),
      ).rejects.toThrow(NotFoundException);
    expect(db.query).not.toHaveBeenCalled();
    expect(audits.listNcsForVendor).not.toHaveBeenCalled();
    expect(files.assertCanDownload).not.toHaveBeenCalled();
  });
  it('does not auto-open a document when contractor names are ambiguous, even if only one has files', async () => {
    const { service, db } = setup();
    db.query
      .mockResolvedValueOnce([
        { id: 'one', branch_id: 'branch' },
        { id: 'two', branch_id: 'branch' },
      ])
      .mockResolvedValueOnce([
        {
          id: 'doc',
          contractor_id: 'one',
          branch_id: 'branch',
          title: 'Certificate',
          name: 'ABC',
          user_code: 'C1',
        },
      ]);
    expect(
      (await service.find(user, { request: 'Show contractor ABC documents' }))
        .status,
    ).toBe('SHORTLIST');
  });
  it('refuses sensitive contractor/evidence modules before querying any metadata', async () => {
    const { service, db, entitlements } = setup();
    entitlements.assertModule.mockImplementation(
      async (_company: string, module: string) => {
        if (module !== 'EMPLOYEE_COMPLIANCE') throw new ForbiddenException();
      },
    );
    for (const request of [
      'Show contractor ABC documents',
      'Show evidence for this non-compliance',
    ])
      await expect(service.find(user, { request })).rejects.toThrow(
        ForbiddenException,
      );
    expect(db.query).not.toHaveBeenCalled();
  });
  it('requires explicit NC context rather than guessing an audit', async () => {
    const { service, db } = setup();
    expect(
      (
        await service.find(user, {
          request: 'Show the evidence uploaded for this non-compliance',
        })
      ).status,
    ).toBe('CONTEXT_REQUIRED');
    expect(db.query).not.toHaveBeenCalled();
  });
  it('reuses publication visibility for NC evidence and exposes no file paths', async () => {
    const { service, db, audits } = setup();
    const ncId = '11111111-1111-4111-8111-111111111111';
    db.query.mockResolvedValue([
      {
        id: 'resubmission',
        audit_id: 'audit',
        nc_id: ncId,
        branch_id: 'branch',
        file_name: 'evidence.pdf',
        status: 'REUPLOADED',
        resubmitted_at: '2026-08-01',
        audit_code: 'AX1',
      },
    ]);
    expect(
      (await service.find(user, { request: `Show evidence for NC ${ncId}` }))
        .status,
    ).toBe('UNAVAILABLE');
    audits.listNcsForVendor.mockResolvedValue({ items: [{ id: ncId }] });
    const result = await service.find(user, {
      request: `Show evidence for NC ${ncId}`,
    });
    expect(result.status).toBe('EXACT');
    expect(result.documents[0]).toMatchObject({
      kind: 'AUDIT_EVIDENCE',
      id: 'resubmission',
      nonComplianceId: ncId,
    });
    expect(db.query.mock.calls[0][1]).toEqual(['company', ncId]);
    expect(db.query.mock.calls[0][0]).toContain(
      'preliminary_published_at IS NOT NULL',
    );
    expect(db.query.mock.calls[0][0]).toContain('nc.published_at IS NOT NULL');
    expect(result.documents[0]).not.toHaveProperty('file_path');
  });
  it('refuses stale evidence after publication visibility is withdrawn before reading or auditing', async () => {
    const { service, db, audits, audit } = setup();
    db.query.mockResolvedValue([
      {
        file_path: 'uploads/nc/evidence.pdf',
        audit_id: 'audit',
        nc_id: 'nc',
        branch_id: 'branch',
      },
    ]);
    const read = jest.spyOn(service as any, 'readStoredFile');
    await expect(
      service.view(user, 'AUDIT_EVIDENCE', 'file', { nonComplianceId: 'nc' }),
    ).rejects.toThrow(NotFoundException);
    expect(audits.listNcsForVendor).toHaveBeenCalledWith(user, 'audit');
    expect(read).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
  it('audits an authorized NC evidence view and never changes audit closure or file records', async () => {
    const { service, db, audits, audit } = setup();
    db.query.mockResolvedValue([
      {
        file_path: 'uploads/nc/evidence.pdf',
        file_name: 'evidence.pdf',
        file_type: 'application/pdf',
        audit_id: 'audit',
        nc_id: 'nc',
        branch_id: 'branch',
      },
    ]);
    audits.listNcsForVendor.mockResolvedValue({ items: [{ id: 'nc' }] });
    jest
      .spyOn(service as any, 'readStoredFile')
      .mockReturnValue(Buffer.from('evidence'));
    expect(
      (
        await service.view(user, 'AUDIT_EVIDENCE', 'file', {
          nonComplianceId: 'nc',
        })
      ).buffer.toString(),
    ).toBe('evidence');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DOCUMENT_VIEWED', entityId: 'file' }),
    );
    for (const [sql] of db.query.mock.calls)
      expect(sql.trim()).toMatch(/^SELECT\b/i);
  });
  it('adds actual filing challans and registration certificates without calling lists that create filings', async () => {
    const { service, db } = setup();
    db.query.mockResolvedValueOnce([
      {
        id: 'filing',
        branch_id: 'branch',
        return_type: 'PF monthly',
        period_year: 2026,
        period_month: 8,
        status: 'SUBMITTED',
      },
    ]);
    const result = await service.find(user, {
      request: 'Show PF challan for August 2026',
    });
    expect(result.documents[0]).toMatchObject({
      kind: 'RETURN',
      variant: 'CHALLAN',
      period: '2026-08',
    });
    expect(db.query.mock.calls[0][0]).toContain('is_deleted = false');
    db.query.mockResolvedValueOnce([
      {
        id: 'registration',
        branch_id: 'branch',
        type: 'SHOPS',
        status: 'ACTIVE',
      },
    ]);
    expect(
      (await service.find(user, { request: 'Show shops renewal' }))
        .documents[0],
    ).toMatchObject({ kind: 'REGISTRATION', variant: 'RENEWAL' });
    for (const [sql] of db.query.mock.calls)
      expect(sql.trim()).toMatch(/^SELECT\b/i);
  });
  it('refuses a forged registration/filing link outside the selected branch before file reads', async () => {
    const { service, db, files } = setup(false);
    db.query.mockResolvedValue([
      { branch_id: 'other', file_path: 'uploads/file.pdf' },
    ]);
    await expect(
      service.view({ ...user, userType: 'BRANCH' }, 'REGISTRATION', 'doc', {
        variant: 'CERTIFICATE',
      }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.view({ ...user, userType: 'BRANCH' }, 'RETURN', 'doc', {
        variant: 'CHALLAN',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(files.assertCanDownload).not.toHaveBeenCalled();
  });
});
