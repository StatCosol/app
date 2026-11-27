import * as fs from 'fs';
import * as path from 'path';
import { validateSync } from 'class-validator';
import { MonthlyDocumentsService } from '../monthly-documents/monthly-documents.service';
import { UploadMonthlyDocumentDto } from '../monthly-documents/dto/upload-monthly-document.dto';
import { NominationsService } from '../nominations/nominations.service';
import { ClientEmployeesController } from '../employees/employees.controller';
import { CrmComplianceTrackerController } from '../crm/crm-compliance-tracker.controller';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(() => true),
  statSync: jest.fn(() => ({ size: 20 })),
}));
jest.mock('../employees/utils/statutory-nomination-pdf', () => ({
  buildNominationPdf: jest.fn(async () => Buffer.from('%PDF-test')),
}));

describe('Document writers keep untrusted values inside their folders', () => {
  const clientId = '11111111-1111-4111-8111-111111111111';
  const branchId = '22222222-2222-4222-8222-222222222222';
  const user: any = {
    id: 'test-user',
    userId: 'test-user',
    clientId,
    userType: 'CLIENT',
  };
  const file: any = {
    originalname: 'TEST-evidence.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n'),
    size: 9,
  };
  beforeEach(() => jest.clearAllMocks());

  it.each([
    '../other-client',
    '../../forms',
    '..\\other-client',
    '2026-11/../../other',
    '/tmp',
    'C:\\temp',
    '2026-00',
    '2026-13',
    '',
  ])(
    'rejects unsafe or invalid monthly scope %p before writing',
    async (month) => {
      const dto = Object.assign(new UploadMonthlyDocumentDto(), {
        branchId,
        month,
        code: 'PF',
      });
      expect(validateSync(dto).some((e) => e.property === 'month')).toBe(true);
      const service = new MonthlyDocumentsService(
        {} as any,
        { assertBranchAccess: jest.fn() } as any,
      );
      await expect(
        service.upload(user, branchId, month, 'PF', file),
      ).rejects.toThrow('month must be YYYY-MM');
      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    },
  );

  it('preserves a valid monthly scope and sanitizes the document code and filename', async () => {
    const repo = { create: jest.fn((v) => v), save: jest.fn(async (v) => v) };
    const access = { assertBranchAccess: jest.fn(async () => undefined) };
    const service = new MonthlyDocumentsService(repo as any, access as any);
    const saved = await service.upload(user, branchId, '2026-11', '../PF', {
      ...file,
      originalname: '..\\other.pdf',
    });
    const destination = String(
      (fs.writeFileSync as jest.Mock).mock.calls[0][0],
    );
    expect(path.dirname(destination)).toBe(
      path.join(
        process.cwd(),
        'uploads',
        'monthly-compliance',
        branchId,
        '2026-11',
      ),
    );
    expect(saved.month).toBe('2026-11');
    expect(access.assertBranchAccess).toHaveBeenCalledWith(user.id, branchId);
  });

  const codes = [
    '../other-client/archived',
    '..\\other-client\\archived',
    'x/../../../target',
    'C:\\temp\\escape',
    'normal-code',
    'a'.repeat(300),
  ];
  it.each(codes)(
    'nomination service contains employee code %p',
    async (employeeCode) => {
      const employee: any = { id: 'test-employee', employeeCode, branchId };
      const repo: any = {
        findOne: jest.fn(async () => null),
        create: jest.fn((v) => v),
        save: jest.fn(async (v) => ({ id: 'test-form', ...v })),
      };
      const service = new NominationsService(
        { findOne: jest.fn(async () => employee) } as any,
        { findOne: jest.fn(async () => ({ id: 'test-nomination' })) } as any,
        { find: jest.fn(async () => []) } as any,
        repo,
      );
      const createPdf = jest
        .spyOn(service as any, 'createPdf')
        .mockResolvedValue(undefined);
      const result = await service.generateForm(user, {
        employeeId: employee.id,
        formType: 'PF',
      });
      const params = createPdf.mock.calls[0][0] as any;
      expect(path.dirname(params.filePath)).toBe(
        path.join(
          process.cwd(),
          'uploads',
          'employees',
          'nominations',
          clientId,
        ),
      );
      expect(result.fileName).toMatch(/^[a-zA-Z0-9._-]+\.pdf$/);
      expect(params.emp.employeeCode).toBe(employeeCode);
    },
  );

  it.each(codes)(
    'employee form controller contains employee code %p',
    async (employeeCode) => {
      const service: any = {
        findById: jest.fn(async () => ({
          id: 'test-employee',
          employeeCode,
          branchId,
        })),
        listNominations: jest.fn(async () => []),
        saveGeneratedForm: jest.fn(async () => ({})),
      };
      const controller = new ClientEmployeesController(
        service,
        { getUserBranchIds: jest.fn(async () => []) } as any,
        {} as any,
        {} as any,
      );
      await controller.generateForm(user, 'test-employee', 'PF');
      const destination = String(
        (fs.writeFileSync as jest.Mock).mock.calls[0][0],
      );
      expect(path.dirname(destination)).toBe(
        path.join(process.cwd(), 'uploads', 'forms', clientId),
      );
      expect(path.basename(destination)).toMatch(/^[a-zA-Z0-9._-]+\.pdf$/);
    },
  );

  it.each([
    '42/../../other',
    '42\\..\\other',
    '42suffix',
    '-1',
    '0',
    '1.5',
    '9007199254740992',
  ])(
    'rejects partial or unsafe MCD item ID %p before reading or writing',
    async (itemId) => {
      const db: any = { many: jest.fn() };
      const controller = new CrmComplianceTrackerController(db, {} as any);
      await expect(
        controller.uploadMcdItem(user, itemId, file),
      ).rejects.toThrow('positive integer');
      expect(db.many).not.toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    },
  );

  it('stores MCD evidence using the scoped database ID and a safe unique name', async () => {
    const db: any = {
      many: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 42,
            task_id: 'test-task',
            client_id: clientId,
            branch_id: branchId,
            status: 'PENDING',
          },
        ])
        .mockResolvedValue([]),
    };
    const controller = new CrmComplianceTrackerController(db, {} as any);
    await controller.uploadMcdItem(user, '42', file);
    const destination = String(
      (fs.writeFileSync as jest.Mock).mock.calls[0][0],
    );
    expect(path.dirname(destination)).toBe(
      path.join(process.cwd(), 'uploads', 'mcd-evidence', clientId, branchId),
    );
    expect(path.basename(destination)).toMatch(/^mcd_42_[a-zA-Z0-9._-]+\.pdf$/);
  });
});
