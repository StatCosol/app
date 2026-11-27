import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PayrollPayslipsService } from './payroll-payslips.service';
import { payslipFileName } from './utils/payslip-file-name';
import { generatePayslipPdfBuffer } from './utils/payslip-pdf';
import archiver = require('archiver');

jest.mock('archiver', () => jest.fn());

jest.mock('./utils/payslip-pdf', () => ({
  generatePayslipPdfBuffer: jest.fn(async () => Buffer.from('TEST PDF')),
  loadLogoBuffer: jest.fn(() => null),
}));

describe('payslip filename containment', () => {
  it.each([
    '../../other-client/payslip',
    '..\\..\\other-client\\payslip',
    'C:\\temp\\pay',
    '/tmp/pay',
    'EMP\r\nX-Test: yes',
    'a\0b',
    '給与',
    '',
    '.'.repeat(400),
  ])('keeps untrusted code %p inside the run on Windows and POSIX', (code) => {
    const name = payslipFileName(2026, 11, code, 'worker-a');
    expect(name).toMatch(/^payslip_2026_11_[a-zA-Z0-9_-]+\.pdf$/);
    expect(name.length).toBeLessThan(150);
    for (const platform of [path.posix, path.win32]) {
      const base = platform.resolve('archive', 'run-a');
      expect(platform.dirname(platform.resolve(base, name))).toBe(base);
    }
  });
  it('avoids sanitisation, truncation and case collisions and is idempotent', () => {
    const codes = [
      'a/b',
      'a\\b',
      'a_b',
      'ABC',
      'abc',
      'x'.repeat(100) + '1',
      'x'.repeat(100) + '2',
    ];
    const names = codes.map((code) =>
      payslipFileName(2026, 11, code, 'worker-a').toLowerCase(),
    );
    expect(new Set(names).size).toBe(codes.length);
    expect(payslipFileName(2026, 11, 'EMP1', 'worker-a')).not.toBe(
      payslipFileName(2026, 11, 'EMP1', 'worker-b'),
    );
    expect(payslipFileName(2026, 11, 'EMP1', 'worker-a')).toBe(
      payslipFileName(2026, 11, 'EMP1', 'worker-a'),
    );
  });
  it('archives unmatched imported codes without overwriting another run', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'payslip-security-'));
    const cwd = jest.spyOn(process, 'cwd').mockReturnValue(temp);
    try {
      const run = {
        id: 'run-a',
        clientId: 'client-a',
        status: 'APPROVED',
        periodYear: 2026,
        periodMonth: 11,
      };
      const code = 'x/../../other-client/existing';
      const worker = {
        id: 'worker-a',
        employeeCode: code,
        employeeName: 'TEST ONLY',
        employeeId: null,
      };
      const victim = path.join(
        temp,
        'uploads',
        'payslips-archive',
        'other-client',
        'existing.pdf',
      );
      fs.mkdirSync(path.dirname(victim), { recursive: true });
      fs.writeFileSync(victim, 'UNCHANGED');
      const save = jest.fn(async (row) => row);
      const svc = Object.create(PayrollPayslipsService.prototype);
      Object.assign(svc, {
        runRepo: { findOne: jest.fn(async () => run) },
        runEmployeeRepo: {
          find: jest.fn(async () => [worker]),
          findOne: jest.fn(async () => worker),
          manager: { getRepository: () => ({ find: async () => [] }) },
        },
        clientRepo: { findOne: async () => null },
        scope: { assertPayrollAccessToClient: jest.fn(async () => {}) },
        payslipArchiveRepo: {
          findOne: async () => null,
          create: (row) => row,
          save,
        },
        enrichLeaveAttendanceValues: jest.fn(async () => {}),
      });
      await svc.archiveRunPayslips({ id: 'test-payroll' }, 'run-a');
      const archived = save.mock.calls[0][0];
      expect(path.dirname(archived.filePath)).toBe(
        path.join(temp, 'uploads', 'payslips-archive', 'run-a'),
      );
      expect(fs.readFileSync(victim, 'utf8')).toBe('UNCHANGED');
      expect(fs.readFileSync(archived.filePath, 'utf8')).toBe('TEST PDF');
      expect(archived.employeeCode).toBe(code);
      expect(
        (generatePayslipPdfBuffer as jest.Mock).mock.calls.at(-1)[0].header
          .empCode,
      ).toBe(code);
      const downloaded = await svc.generatePayslipPdfForPayroll(
        { id: 'test-payroll' },
        'run-a',
        code,
      );
      expect(downloaded.fileName).toBe(archived.fileName);
    } finally {
      cwd.mockRestore();
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  it('does not export legacy archive paths or ZIP names outside the run', async () => {
    const temp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'payslip-zip-security-'),
    );
    const cwd = jest.spyOn(process, 'cwd').mockReturnValue(temp);
    const base = path.resolve(temp, 'uploads', 'payslips-archive', 'run-a');
    const safe = {
      filePath: path.join(base, 'safe.pdf'),
      fileName: 'safe.pdf',
    };
    const archive = {
      on: jest.fn(),
      pipe: jest.fn(),
      file: jest.fn(),
      finalize: jest.fn(async () => {}),
    };
    (archiver as unknown as jest.Mock).mockReturnValue(archive);
    try {
      fs.mkdirSync(base, { recursive: true });
      fs.writeFileSync(safe.filePath, 'TEST PDF');
      const outside = path.resolve(base, '..', 'other-client', 'secret.pdf');
      fs.mkdirSync(path.dirname(outside), { recursive: true });
      fs.writeFileSync(outside, 'DO NOT EXPORT');
      const svc = Object.create(PayrollPayslipsService.prototype);
      Object.assign(svc, {
        runRepo: {
          findOne: async () => ({
            id: 'run-a',
            clientId: 'client-a',
            status: 'APPROVED',
            periodYear: 2026,
            periodMonth: 11,
          }),
        },
        scope: { assertPayrollAccessToClient: jest.fn(async () => {}) },
        archiveRunPayslips: jest.fn(async () => {}),
        payslipArchiveRepo: {
          find: async () => [
            safe,
            {
              filePath: path.resolve(base, '..', 'other-client', 'secret.pdf'),
              fileName: 'secret.pdf',
            },
            { filePath: safe.filePath, fileName: '../safe.pdf' },
            { filePath: safe.filePath, fileName: '..\\safe.pdf' },
            { filePath: safe.filePath, fileName: 'different.pdf' },
          ],
        },
      });
      await svc.streamPayslipsZip({ id: 'test-payroll' }, 'run-a', {
        setHeader: jest.fn(),
      });
      expect(archive.file).toHaveBeenCalledTimes(1);
      expect(archive.file).toHaveBeenCalledWith(safe.filePath, {
        name: safe.fileName,
      });
      expect(archive.finalize).toHaveBeenCalledTimes(1);
    } finally {
      cwd.mockRestore();
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});
