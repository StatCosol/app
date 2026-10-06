import { NotFoundException } from '@nestjs/common';
import * as path from 'path';
import { resolveStoredUploadPath } from './stored-upload-path';
import { ClientPayrollDocumentsService } from '../payroll/client-payroll-documents.service';
import { ReqUser } from '../access/access-scope.service';
const fs = require('fs') as typeof import('fs');

describe('Assist stored upload containment', () => {
  afterEach(() => jest.restoreAllMocks());
  function files() {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest
      .spyOn(fs, 'realpathSync')
      .mockImplementation((value: any) => String(value));
  }
  it('resolves registered relative and legacy keys under uploads', () => {
    files();
    const expected = path.resolve(
      process.cwd(),
      'uploads',
      'payroll',
      'slip.pdf',
    );
    expect(resolveStoredUploadPath('payroll/slip.pdf')).toBe(expected);
    expect(resolveStoredUploadPath('uploads/payroll/slip.pdf')).toBe(expected);
    expect(resolveStoredUploadPath('/uploads/payroll/slip.pdf')).toBe(expected);
    expect(resolveStoredUploadPath(expected)).toBe(expected);
  });
  it.each([
    '../secret.pdf',
    'uploads/../secret.pdf',
    'https://example.com/slip.pdf',
  ])('rejects untrusted storage path %s', (value) => {
    files();
    expect(() => resolveStoredUploadPath(value)).toThrow(NotFoundException);
  });
  it('rejects an absolute file outside uploads and a symlink resolving outside uploads', () => {
    files();
    expect(() =>
      resolveStoredUploadPath(path.resolve(process.cwd(), 'secret.pdf')),
    ).toThrow(NotFoundException);
    const candidate = path.resolve(
      process.cwd(),
      'uploads',
      'payroll',
      'slip.pdf',
    );
    jest
      .spyOn(fs, 'realpathSync')
      .mockImplementation((value: any) =>
        String(value) === candidate
          ? path.resolve(process.cwd(), 'secret.pdf')
          : String(value),
      );
    expect(() => resolveStoredUploadPath(candidate)).toThrow(NotFoundException);
  });
  it.each(['outside', 'symlink'])(
    'blocks a published payslip %s path before the existing reader touches file bytes',
    async (variant) => {
      files();
      const candidate =
        variant === 'outside'
          ? path.resolve(process.cwd(), 'secret.pdf')
          : path.resolve(process.cwd(), 'uploads', 'payroll', 'slip.pdf');
      if (variant === 'symlink')
        jest
          .spyOn(fs, 'realpathSync')
          .mockImplementation((value: any) =>
            String(value) === candidate
              ? path.resolve(process.cwd(), 'secret.pdf')
              : String(value),
          );
      const read = jest.spyOn(fs, 'readFileSync');
      const service = new ClientPayrollDocumentsService(
        { findOne: jest.fn().mockResolvedValue({ settings: {} }) } as any,
        {
          findOne: jest.fn().mockResolvedValue({
            id: 'run',
            clientId: 'company',
            status: 'APPROVED',
          }),
        } as any,
        {
          findOne: jest.fn().mockResolvedValue({
            clientId: 'company',
            employeeCode: 'EMP1',
            employeeId: 'employee',
            branchId: 'branch',
          }),
        } as any,
        {
          findOne: jest
            .fn()
            .mockResolvedValue({ filePath: candidate, fileName: 'slip.pdf' }),
        } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      const user = {
        id: 'user',
        userId: 'user',
        clientId: 'company',
        roleCode: 'CLIENT',
        userType: 'MASTER',
      } as ReqUser;
      await expect(
        service.downloadPayslip(user, 'run', 'EMP1', {
          resolveStoredPath: resolveStoredUploadPath,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(
        read.mock.calls.some(([filePath]) => String(filePath) === candidate),
      ).toBe(false);
    },
  );
});
