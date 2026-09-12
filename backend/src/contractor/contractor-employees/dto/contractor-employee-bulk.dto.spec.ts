import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BulkCreateContractorEmployeesDto } from './contractor-employee-bulk.dto';
import { validateBulkRow } from '../contractor-employees.service';

/**
 * The bulk endpoint used to take `@Body() body: { branchId?: string; rows: any[] }`.
 * A plain TypeScript type erases to `Object` in the emitted metadata, so the
 * global ValidationPipe skipped it entirely and every row went straight into
 * `prepare()` and on into the entity. That is also why bulk import kept working
 * while single registration returned a bare 400 — one path was validated and
 * the other was not validated at all.
 *
 * Rows are checked per row rather than by the pipe, so that one bad cell fails
 * one line instead of the whole file. These tests pin both halves.
 */
describe('bulk upload validation', () => {
  /** The row shape validateBulkRows() builds in the uploader, blanks included. */
  const goodRow = {
    name: 'Ravi Kumar',
    skillCategory: 'SKILLED',
    monthlySalary: 15000,
    dailyWage: null,
    gender: 'M',
    dateOfBirth: '1990-05-12',
    fatherName: 'Suresh Kumar',
    phone: '+919876543210',
    email: 'ravi@example.com',
    designation: 'Helper',
    department: 'Production',
    dateOfJoining: '2025-01-15',
    bankAccount: '001234567890',
    aadhaar: '123456789012',
    pan: 'ABCDE1234F',
    uan: '100200300400',
    esic: '31001234560000001',
    pfApplicable: true,
    esiApplicable: false,
    stateCode: 'KA',
    branchId: undefined,
  };

  describe('the envelope', () => {
    const errorsFor = (payload: Record<string, unknown>) =>
      validateSync(plainToInstance(BulkCreateContractorEmployeesDto, payload), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }).map((e) => e.property);

    it('accepts a normal upload', () => {
      expect(
        errorsFor({
          branchId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
          rows: [goodRow],
        }),
      ).toEqual([]);
    });

    it('rejects a branchId that is not a uuid', () => {
      // It was reaching assertBranchAccess() as whatever the caller sent.
      expect(errorsFor({ branchId: 'not-a-uuid', rows: [goodRow] })).toContain(
        'branchId',
      );
    });

    it('rejects rows that are not an array of objects', () => {
      expect(errorsFor({ rows: 'nope' })).toContain('rows');
      expect(errorsFor({ rows: [1, 2, 3] })).toContain('rows');
    });

    it('rejects an empty upload and one over the service cap', () => {
      expect(errorsFor({ rows: [] })).toContain('rows');
      expect(
        errorsFor({ rows: Array.from({ length: 1001 }, () => goodRow) }),
      ).toContain('rows');
    });
  });

  describe('a single row', () => {
    it('accepts the row the uploader builds', () => {
      const res = validateBulkRow(goodRow);
      expect(res.ok ? null : res.error).toBeNull();
    });

    it('rejects a column the import does not own', () => {
      // prepare() deletes clientId/branchId/contractorUserId/id, but nothing
      // stopped a row from setting status, dateOfExit or exitReason — the row
      // was spread straight into em.create().
      const res = validateBulkRow({
        ...goodRow,
        status: 'PENDING_DELETE',
        dateOfExit: '2020-01-01',
        exitReason: 'crafted',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain('status');
        expect(res.error).toContain('dateOfExit');
      }
    });

    it('hands the service only declared columns', () => {
      // The row is spread into em.create(), so what survives validation is what
      // can reach the entity. plainToInstance materialises every declared
      // property, so the instance carries employeeCode/punchCode as undefined
      // even when the sheet has no such column — harmless, and TypeORM ignores
      // undefined. What matters is that nothing UNdeclared is on it.
      const declared = [
        'name',
        'skillCategory',
        'monthlySalary',
        'dailyWage',
        'gender',
        'dateOfBirth',
        'dateOfJoining',
        'fatherName',
        'phone',
        'email',
        'designation',
        'department',
        'bankAccount',
        'aadhaar',
        'pan',
        'uan',
        'esic',
        'pfApplicable',
        'esiApplicable',
        'stateCode',
        'employeeCode',
        'punchCode',
        'branchId',
      ];
      const res = validateBulkRow(goodRow);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(
          Object.keys(res.row).filter((k) => !declared.includes(k)),
        ).toEqual([]);
        for (const owned of [
          'status',
          'dateOfExit',
          'exitReason',
          'isActive',
        ]) {
          expect(res.row).not.toHaveProperty(owned);
        }
      }
    });

    it('coerces a numeric cell that arrives as text', () => {
      // Spreadsheets deliver these as strings often enough that rejecting them
      // would fail real uploads.
      const res = validateBulkRow({ ...goodRow, monthlySalary: '15000' });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.row.monthlySalary).toBe(15000);
    });

    it('fails an unparseable salary instead of silently importing null', () => {
      // toNumberOrNull() turned this into null, the worker was created with no
      // salary, and validateSalary() returns early on a null salary — so the
      // statutory minimum-wage check was skipped for that worker.
      const res = validateBulkRow({ ...goodRow, monthlySalary: 'n/a' });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain('monthlySalary');
    });

    it('fails a negative wage and one wider than its column', () => {
      const low = validateBulkRow({ ...goodRow, monthlySalary: -1 });
      expect(low.ok).toBe(false);
      const wide = validateBulkRow({ ...goodRow, dailyWage: 100000000 });
      expect(wide.ok).toBe(false);
    });

    it('names the offending column in the message', () => {
      const res = validateBulkRow({ ...goodRow, gender: 'X'.repeat(11) });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain('gender');
    });

    it('still accepts the skill spellings a spreadsheet contains', () => {
      // normalizeSkill() uppercases and folds separators; the service rejects
      // the row by name if the result is not one of the four grades, so @IsIn
      // here would reject these before that ever ran.
      for (const spelling of ['semi skilled', 'Semi-Skilled', 'skilled']) {
        expect(
          validateBulkRow({ ...goodRow, skillCategory: spelling }).ok,
        ).toBe(true);
      }
    });

    it('accepts an Excel date cell stringified by the browser', () => {
      // Not ISO, and rejecting it here would break uploads that work today.
      const res = validateBulkRow({
        ...goodRow,
        dateOfBirth: 'Sat May 12 1990 00:00:00 GMT+0530 (India Standard Time)',
      });
      expect(res.ok).toBe(true);
    });

    it('rejects a row that is not an object at all', () => {
      expect(validateBulkRow(null).ok).toBe(false);
      expect(validateBulkRow('a string').ok).toBe(false);
      expect(validateBulkRow([1]).ok).toBe(false);
    });
  });
});
