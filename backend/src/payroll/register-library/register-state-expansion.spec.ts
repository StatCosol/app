import * as ExcelJS from 'exceljs';
import { REGISTER_FORMS } from './register-catalogue';
import { registerLayout } from './register-layouts';
import {
  definition,
  registerWorkbook,
  RegisterInput,
  validateRegister,
} from './register-workbook';
import { RegisterBuilderService } from './register-builder.service';
import {
  LEGAL_WAGE_REGISTER_TYPES,
  legalRegisterType,
} from './register-identity';
const added = REGISTER_FORMS.filter((f) =>
  ['aps', 'kas', 'tns', 'hrs', 'wbs', 'tn'].includes(f.sourceId),
);
const find = (s: string, n: string) =>
  added.find((f) => f.sourceId === s && f.formNumber === n)!;
const findSource = (id: string) => added.find((f) => f.id === id)!.sourceId;
function fixture(id: string): RegisterInput {
  const { layout } = definition(id);
  const values = (fields: typeof layout.fields) =>
    Object.fromEntries(
      fields
        .filter((f) => f.required)
        .map((f) => [
          f.key,
          f.type === 'date'
            ? '2026-03-01'
            : ['number', 'money'].includes(f.type)
              ? 0
              : 'Reviewed test evidence',
        ]),
    );
  const row = values(layout.fields);
  if (layout.fields.some((f) => f.key === 'leaveType'))
    row.leaveType = 'PRIVILEGE';
  if (layout.fields.some((f) => f.key === 'serial')) row.serial = 1;
  if (layout.fields.some((f) => f.key === 'sex')) row.sex = 'M';
  for (let d = 1; d <= 31; d++)
    if (layout.fields.some((f) => f.key === 'day' + d + 'Status'))
      row['day' + d + 'Status'] = ['tns', 'tn'].includes(findSource(id))
        ? 'LOP'
        : 'A';
  return {
    branchId: '94ad1c42-ea05-460e-b494-0a7e634de127',
    year: 2026,
    month: 3,
    employer: 'Test employer',
    owner: 'Test owner',
    employerPan: 'ABCDE1234F',
    registrationNumber: 'TEST-001',
    issueDate: '2026-03-31',
    supportingReference: 'Test supporting evidence',
    particulars: values(layout.particulars!),
    rows: [row],
  };
}
describe('Seven-state register expansion', () => {
  it.each(added.map((f) => [f.id, f] as const))(
    '%s validates a reviewed record and exports every source field',
    async (id, form) => {
      const input = fixture(id),
        { layout } = definition(id);
      expect(new Set(layout.fields.map((f) => f.key)).size).toBe(
        layout.fields.length,
      );
      expect(validateRegister(id, input)).toEqual([]);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load((await registerWorkbook(id, input)) as any);
      expect(book.getWorksheet('Establishment details')).toBeDefined();
      expect(book.getWorksheet('Form II')).toBeUndefined();
      const text = JSON.stringify(
        book.worksheets.map((s) => s.getSheetValues()),
      );
      for (const field of layout.fields)
        expect(text).toContain(JSON.stringify(field.label).slice(1, -1));
      for (const field of layout.particulars!)
        expect(text).toContain(field.label);
      expect(text).toContain(form.actCode);
      expect(
        validateRegister(id, { ...input, particulars: undefined }).join(' '),
      ).toMatch(/establishment/);
      expect(
        validateRegister(id, { ...input, supportingReference: '' }).join(' '),
      ).toMatch(/reference/);
    },
  );
  it('preserves source-specific form columns and both Tamil Nadu Factory 15 parts', async () => {
    expect(definition(find('tns', 'U').id).layout.fields).toHaveLength(24);
    expect(definition(find('tns', 'W').id).layout.fields).toHaveLength(30);
    expect(definition(find('tns', 'X').id).layout.fields).toHaveLength(21);
    expect(definition(find('tn', '12').id).layout.fields).toHaveLength(24);
    expect(
      definition(find('tn', '15').id).layout.tableParts!.map(
        (p) => p.fields.length,
      ),
    ).toEqual([22, 31]);
    expect(
      definition(find('kas', 'T').id).layout.fields.slice(-1)[0].label,
    ).toMatch(/^38\./);
    expect(definition(find('hrs', 'E').id).layout.fields).toHaveLength(15);
    expect(definition(find('wbs', 'M').id).layout.fields).toHaveLength(7);
    const id = find('tn', '15').id;
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await registerWorkbook(id, fixture(id))) as any);
    expect(book.worksheets.map((s) => s.name)).toEqual([
      'Identity and review',
      'Establishment details',
      'Form 15 Part I',
      'Form 15 Part II',
    ]);
  });
  it('requires full actual attendance and rejects non-existent February days', () => {
    const id = find('kas', 'T').id,
      input = fixture(id);
    delete input.rows[0].day14Status;
    expect(validateRegister(id, input).join(' ')).toContain('day 14 requires');
    input.month = 2;
    expect(validateRegister(id, input).join(' ')).toContain(
      'day 31 does not exist',
    );
  });
  it('checks earnings, deductions and leave balances without treating rates as earnings', () => {
    for (const [source, number, key] of [
      ['kas', 'T', 'gross'],
      ['tns', 'W', 'advanceClosing'],
      ['tns', 'X', 'earnedClosing'],
      ['tn', '15', 'net'],
      ['aps', 'XXIII', 'gross'],
      ['wbs', 'W', 'gross'],
      ['hrs', 'D', 'gross'],
    ]) {
      const id = find(source, number).id,
        input = fixture(id);
      input.rows[0][key] = 99;
      expect(validateRegister(id, input).join(' ')).toContain('reconcile');
    }
    const id = find('wbs', 'M').id,
      input = fixture(id);
    input.rows[0].wageRate = 30000;
    expect(validateRegister(id, input)).toEqual([]);
    input.particulars!.certifiedPaid = 100;
    expect(validateRegister(id, input).join(' ')).toContain(
      'Certified payment total',
    );
  });
  it('requires both payment witnesses, and keeps PF/ESI references as identifiers', () => {
    const id = find('wbs', 'M').id,
      input = fixture(id);
    delete input.particulars!.witnessTwo;
    expect(validateRegister(id, input).join(' ')).toContain(
      'Second payment witness',
    );
    expect(
      definition(find('tns', 'W').id).layout.fields.find(
        (f) => f.key === 'pfReference',
      )?.type,
    ).toBe('text');
    expect(
      definition(find('tn', '15').id).layout.fields.find((f) => f.key === 'pf')
        ?.type,
    ).toBe('money');
  });
  it('accepts reviewed hours, rejects invalid codes and requires actual factory shifts', () => {
    for (const [source, number] of [
      ['tns', 'V'],
      ['tn', '25'],
    ]) {
      const id = find(source, number).id,
        input = fixture(id);
      input.rows[0].day1Status = '8.5';
      if (source === 'tn') {
        expect(validateRegister(id, input).join(' ')).toContain('actual shift');
        input.rows[0].day1Shift = 'First shift';
      }
      expect(validateRegister(id, input)).toEqual([]);
      for (const value of ['25', 'P', 'A', '-1']) {
        input.rows[0].day1Status = value;
        expect(validateRegister(id, input).join(' ')).toContain(
          'prescribed Tamil Nadu',
        );
      }
    }
  });
  it('allows future requested leave but requires coherent periods and an existing application', () => {
    const id = find('wbs', 'J').id,
      input = fixture(id);
    input.rows[0].appliedFrom = '2026-04-01';
    input.rows[0].appliedTo = '2026-04-05';
    expect(validateRegister(id, input)).toEqual([]);
    input.rows[0].appliedTo = '2026-03-31';
    expect(validateRegister(id, input).join(' ')).toContain('precedes');
    input.rows[0].applicationDate = '2026-04-01';
    expect(validateRegister(id, input).join(' ')).toContain(
      'after the issue date',
    );
  });
  it('reconciles Haryana monthly overtime with daily entries', () => {
    const id = find('hrs', 'C').id,
      input = fixture(id);
    input.particulars!.monthOvertime = 2;
    expect(validateRegister(id, input).join(' ')).toContain('Monthly overtime');
    input.rows[0].otHours = 2;
    expect(validateRegister(id, input)).toEqual([]);
  });
  it('retains blank signatures and leading zeros in PF/ESI identifiers', async () => {
    const id = find('kas', 'T').id,
      input = fixture(id);
    input.rows[0].pfNumber = '00012345678901234567890';
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await registerWorkbook(id, input)) as any);
    const sheet = book.getWorksheet('Form T')!;
    expect(sheet.getCell('G6').value).toBe(input.rows[0].pfNumber);
    expect(sheet.getCell('F6').value).toBe('');
    expect(sheet.getCell(6, definition(id).layout.fields.length).value).toBe(
      '',
    );
  });
  it('treats new wages, deduction and benefit registers as salary-sensitive', () => {
    for (const f of added) {
      if (definition(f.id).layout.fields.some((x) => x.type === 'money'))
        expect(LEGAL_WAGE_REGISTER_TYPES).toContain(legalRegisterType(f.id));
    }
  });
  it.each(added.map((f) => [f.id, f] as const))(
    '%s cannot cross state or establishment scope',
    async (id, form) => {
      const branch = {
        id: '94ad1c42-ea05-460e-b494-0a7e634de127',
        clientId: 'client',
        stateCode: form.jurisdiction,
      };
      const decision = {
        applicable: true,
        computedAt: '2026-10-02',
        factsUpdatedAt: '2026-10-01',
        government: 'STATE',
        factState: form.jurisdiction,
        establishmentType: form.sourceId === 'tn' ? 'FACTORY' : 'ESTABLISHMENT',
      };
      const query = jest.fn(async () => [decision]);
      const builder = new RegisterBuilderService(
        {
          query,
          getRepository: () => ({ findOneBy: async () => branch }),
        } as any,
        {
          assertBranchAllowed: jest.fn(),
          assertCcoBranchAllowed: jest.fn(),
          assertClientAllowed: jest.fn(),
        } as any,
      );
      await expect(
        builder.context(id, branch.id, 2026, 3, {} as any),
      ).resolves.toBeDefined();
      expect(query).toHaveBeenCalledWith(expect.any(String), [
        branch.id,
        form.applicabilityCode || form.actCode,
      ]);
      decision.establishmentType =
        form.sourceId === 'tn' ? 'ESTABLISHMENT' : 'FACTORY';
      await expect(
        builder.context(id, branch.id, 2026, 3, {} as any),
      ).rejects.toThrow(/factory|establishment/);
      branch.stateCode = 'ZZ';
      await expect(
        builder.context(id, branch.id, 2026, 3, {} as any),
      ).rejects.toThrow(/different state/);
    },
  );
  it('rejects missing decisions and mismatched reporting periods', async () => {
    const form = find('tns', 'W'),
      input = fixture(form.id);
    input.particulars!.wageFrom = '2026-02-01';
    expect(validateRegister(form.id, input).join(' ')).toContain(
      'selected month',
    );
    const id = find('wbs', 'I').id,
      daily = fixture(id);
    daily.particulars!.workDate = '2026-02-01';
    expect(validateRegister(id, daily).join(' ')).toContain('selected month');
  });
});
