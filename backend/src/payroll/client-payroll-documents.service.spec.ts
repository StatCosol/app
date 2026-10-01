import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import { ClientPayrollDocumentsService } from './client-payroll-documents.service';
import { ReqUser } from '../access/access-scope.service';

describe('ClientPayrollDocumentsService downloads', () => {
  const branchA = '11111111-1111-1111-1111-111111111111';
  const branchB = '22222222-2222-2222-2222-222222222222';
  const clientId = '33333333-3333-3333-3333-333333333333';
  let fixtureDir: string;
  let filePath: string;
  const pdf = Buffer.from('%PDF-1.4\nfinalized payroll document\n%%EOF');
  beforeAll(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payroll-downloads-'));
    filePath = path.join(fixtureDir, 'document.pdf');
    fs.writeFileSync(filePath, pdf);
  });
  afterAll(() => {
    fs.unlinkSync(filePath);
    fs.rmdirSync(fixtureDir);
  });

  function user(overrides: Partial<ReqUser> = {}): ReqUser {
    return {
      id: 'user-1',
      userId: 'user-1',
      roleCode: 'CLIENT',
      email: 'branch@example.com',
      clientId,
      userType: 'BRANCH',
      employeeId: null,
      branchIds: [branchA],
      assignedClientIds: [],
      ...overrides,
    };
  }

  function serviceWith(state: {
    run?: any;
    employee?: any;
    master?: any;
    archive?: any;
    fnf?: any;
    documents?: any[];
    settings?: Record<string, unknown>;
    fileExists?: (filePath: string) => boolean;
  }) {
    const settingsRepo = {
      findOne: jest.fn(async () => ({
        settings: {
          allowBranchPayrollAccess: true,
          ...(state.settings || {}),
        },
      })),
    };
    const runRepo = { findOne: jest.fn(async () => state.run ?? null) };
    const runEmployeeRepo = {
      findOne: jest.fn(async () => state.employee ?? null),
      createQueryBuilder: jest.fn(),
    };
    const payslipArchiveRepo = {
      findOne: jest.fn(async () => state.archive ?? null),
    };
    const employeeRepo = { findOne: jest.fn(async () => state.master ?? null) };
    const service = new ClientPayrollDocumentsService(
      settingsRepo as any,
      runRepo as any,
      runEmployeeRepo as any,
      payslipArchiveRepo as any,
      { findOne: jest.fn(async () => state.fnf ?? null) } as any,
      { find: jest.fn(async () => state.documents ?? []) } as any,
      employeeRepo as any,
      {
        renderFnfDocumentPdf: jest.fn(async () => ({
          filename: 'finalized.pdf',
          mimeType: 'application/pdf',
          buffer: pdf,
        })),
      } as any,
    );
    (service as any).fileExists = state.fileExists || (() => true);
    return service;
  }

  it('refuses a BranchDesk download for an employee outside authorized branches', async () => {
    const service = serviceWith({
      run: { id: 'run-1', clientId, status: 'APPROVED', branchId: branchB },
      employee: {
        clientId,
        employeeCode: 'B1',
        branchId: branchB,
        employeeId: 'emp-b',
      },
    });

    await expect(
      service.downloadPayslip(user(), 'run-1', 'B1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a payslip that is not on an approved published run', async () => {
    const service = serviceWith({
      run: { id: 'run-1', clientId, status: 'APPROVED', branchId: branchA },
      employee: {
        clientId,
        employeeCode: 'A1',
        branchId: branchA,
        employeeId: 'emp-a',
      },
      archive: null,
    });

    await expect(
      service.downloadPayslip(user(), 'run-1', 'A1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a BranchDesk user when the requested branch is not authorized', async () => {
    const service = serviceWith({});
    await expect(
      service.listEmployeeRecords(user(), {
        periodYear: '2026',
        periodMonth: '9',
        branchId: branchB,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  function ready(overrides: Record<string, any> = {}) {
    return {
      run: { id: 'run-1', clientId, status: 'APPROVED', branchId: branchA },
      employee: {
        clientId,
        employeeCode: 'A1',
        branchId: branchA,
        employeeId: 'emp-a',
      },
      archive: {
        filePath,
        fileName: 'payslip.pdf',
        fileType: 'application/pdf',
      },
      master: { id: 'emp-a', clientId, branchId: branchA },
      fnf: { id: 'fnf-1', clientId, employeeId: 'emp-a', status: 'COMPLETED' },
      ...overrides,
    };
  }

  it.each(['MASTER', 'BRANCH'])(
    'returns the published payslip bytes for %s',
    async (userType) => {
      const result = await serviceWith(ready()).downloadPayslip(
        user({ userType }),
        'run-1',
        'A1',
      );
      expect(result).toEqual({
        fileName: 'payslip.pdf',
        fileType: 'application/pdf',
        buffer: pdf,
      });
    },
  );

  it.each([
    { run: { id: 'run-1', clientId: 'other', status: 'APPROVED' } },
    { run: { id: 'run-1', clientId, status: 'DRAFT' } },
    { employee: { clientId: 'other', branchId: branchA } },
    { archive: { filePath: '/missing.pdf' }, fileExists: () => false },
  ])(
    'refuses an unpublished, foreign or missing payslip: %j',
    async (change) => {
      await expect(
        serviceWith(ready(change)).downloadPayslip(user(), 'run-1', 'A1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it.each([
    { allowBranchPayrollAccess: false },
    { payrollBranchScope: 'SELECTED', payrollAllowedBranchIds: [branchB] },
  ])('enforces BranchDesk payroll settings: %j', async (settings) => {
    await expect(
      serviceWith(ready({ settings })).downloadPayslip(user(), 'run-1', 'A1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['MASTER', 'BRANCH'])(
    'downloads stored settlement and relieving PDFs for %s',
    async (userType) => {
      const service = serviceWith(
        ready({
          documents: [
            { filePath, fileName: 'issued.pdf', mimeType: 'application/pdf' },
          ],
        }),
      );
      for (const docType of ['SETTLEMENT_STATEMENT', 'RELIEVING_LETTER']) {
        const result = await service.downloadFnfDocument(
          user({ userType }),
          'fnf-1',
          docType,
        );
        expect(result.buffer).toEqual(pdf);
        expect(result.fileName).toBe('issued.pdf');
      }
    },
  );

  it.each(['SETTLED', 'DOCS_ISSUED', 'COMPLETED'])(
    'renders unavailable finalized F&F files for status %s',
    async (status) => {
      const service = serviceWith(
        ready({
          fnf: { id: 'fnf-1', clientId, employeeId: 'emp-a', status },
          documents: [{ filePath: '/missing.pdf' }],
          fileExists: () => false,
        }),
      );
      for (const docType of ['SETTLEMENT_STATEMENT', 'RELIEVING_LETTER']) {
        expect(
          (await service.downloadFnfDocument(user(), 'fnf-1', docType)).buffer,
        ).toEqual(pdf);
      }
    },
  );

  it.each(['DRAFT', 'CALCULATED', 'APPROVED'])(
    'refuses unfinalized F&F status %s',
    async (status) => {
      await expect(
        serviceWith(ready({ fnf: { clientId, status } })).downloadFnfDocument(
          user(),
          'fnf-1',
          'SETTLEMENT_STATEMENT',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it('refuses foreign F&F cases, unauthorized branches and unsupported documents', async () => {
    await expect(
      serviceWith(
        ready({ fnf: { clientId: 'other', status: 'COMPLETED' } }),
      ).downloadFnfDocument(user(), 'fnf-1', 'RELIEVING_LETTER'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      serviceWith(ready({ master: { branchId: branchB } })).downloadFnfDocument(
        user(),
        'fnf-1',
        'RELIEVING_LETTER',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      serviceWith(ready()).downloadFnfDocument(
        user(),
        'fnf-1',
        'INTERNAL_NOTE',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a readable ZIP containing only published payslips in authorized branches', async () => {
    const service = serviceWith(ready());
    jest.spyOn(service as any, 'loadRunEmployees').mockResolvedValue([
      {
        employeeId: 'emp-a',
        employeeCode: 'A1',
        employeeName: 'Alice',
        branchId: branchA,
        runId: 'run-1',
        runStatus: 'APPROVED',
      },
      {
        employeeId: 'emp-b',
        employeeCode: 'B1',
        employeeName: 'Bob',
        branchId: branchB,
        runId: 'run-2',
        runStatus: 'APPROVED',
      },
    ]);
    jest.spyOn(service as any, 'loadArchives').mockResolvedValue([
      { runId: 'run-1', employeeCode: 'A1', fileName: 'payslip.pdf', filePath },
      { runId: 'run-2', employeeCode: 'B1', fileName: 'foreign.pdf', filePath },
    ]);
    jest.spyOn(service as any, 'loadFnfCases').mockResolvedValue([]);
    jest.spyOn(service as any, 'loadFnfDocuments').mockResolvedValue([]);
    jest.spyOn(service as any, 'loadEmployees').mockResolvedValue([]);
    const response = Object.assign(new PassThrough(), { setHeader: jest.fn() });
    const chunks: Buffer[] = [];
    response.on('data', (chunk) => chunks.push(chunk));
    const ended = new Promise<void>((resolve, reject) => {
      response.on('end', resolve);
      response.on('error', reject);
    });
    await service.streamPayslipPack(
      user(),
      { periodYear: 2026, periodMonth: 9 },
      response as any,
    );
    await ended;
    // ExcelJS supplies this ZIP reader as a runtime dependency.
    const zip = await require('unzipper').Open.buffer(Buffer.concat(chunks));
    expect(zip.files.map((file: any) => file.path)).toEqual(['payslip.pdf']);
    expect(await zip.files[0].buffer()).toEqual(pdf);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/zip',
    );
  });
});
