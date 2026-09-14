import * as ExcelJS from 'exceljs';
import { REGISTER_FORMS } from './register-catalogue';
import { RegisterLibraryService } from './register-library.service';
import {
  definition,
  RegisterInput,
  registerWorkbook,
  validateRegister,
} from './register-workbook';
import { RegisterBuilderService } from './register-builder.service';

const ts = 'ts--shops-1988--ts-integrated-2019--ii---iii--tsi';
const mh = (form: string) =>
  REGISTER_FORMS.find((f) => f.sourceId === 'mh' && f.formNumber === form)!.id;
function sample(id: string): RegisterInput {
  const layout = definition(id).layout;
  const make = (fields: typeof layout.fields) =>
    Object.fromEntries(
      fields
        .filter((f) => f.required)
        .map((f) => [
          f.key,
          f.type === 'date'
            ? '2026-09-01'
            : ['money', 'number'].includes(f.type)
              ? 0
              : 'Fictional evidence',
        ]),
    );
  const row = make(layout.fields);
  if ('serial' in row) row.serial = 1;
  if (id === ts) row.sex = 'M';
  if (id === mh('Q')) {
    Object.assign(row, {
      workingFrom: '09:00',
      workingTo: '18:00',
      restFrom: '13:00',
      restTo: '14:00',
      daysWorked: 30,
      gross: 18000,
      overtime: 500,
      pf: 1800,
      deductions: 1800,
      net: 16700,
      deposited: 16700,
      bankAccount: '00012345678901234567890',
    });
    for (let d = 1; d <= 30; d++) row['day' + d + 'Status'] = 'P';
  }
  return {
    branchId: '11111111-1111-4111-8111-111111111111',
    year: 2026,
    month: 9,
    employer: 'Fictional employer',
    owner: 'Fictional owner',
    employerPan: 'ABCDE1234F',
    registrationNumber: 'Fictional LIN',
    issueDate: '2026-09-30',
    supportingReference: 'Reviewed fictional records',
    rows: [row],
    ...(layout.capacityRequired
      ? { actingCapacity: 'DIRECT_EMPLOYER' as const }
      : {}),
    ...(layout.particulars ? { particulars: make(layout.particulars) } : {}),
  };
}
describe('State Shops Act records', () => {
  it('keeps the Telangana Shops binding distinct from unverified multi-Act reuse', () => {
    const forms = new RegisterLibraryService().list('TS').forms;
    expect(forms.find((f) => f.id === ts)?.preparationAvailable).toBe(true);
    expect(
      forms
        .filter((f) => f.actCode === 'MULTI_ACT')
        .every((f) => !f.preparationAvailable),
    ).toBe(true);
    expect(() =>
      definition('ts--multi-act--ts-integrated-2019--ii---iii--tsi'),
    ).toThrow(/reference-only/);
  });
  it('requires both Telangana parts and reconciles establishment counts', () => {
    const input = sample(ts);
    expect(validateRegister(ts, input)).toEqual([]);
    input.particulars!.regularWorkers = 1;
    expect(validateRegister(ts, input).join(' ')).toMatch(/counts disagree/);
    input.particulars!.regularWorkers = 0;
    input.particulars!.adolescentMale = 1;
    expect(validateRegister(ts, input).join(' ')).toMatch(/adolescents exceed/);
    delete input.particulars;
    expect(validateRegister(ts, input).join(' ')).toMatch(
      /both parts are required/,
    );
  });
  it('rejects foreign particulars, malformed counts and duplicate serials', () => {
    const input = sample(ts);
    input.particulars!.regularWorkers = '1.5';
    input.particulars!.foreign = 'not a prescribed field';
    input.rows.push({ ...input.rows[0] });
    expect(validateRegister(ts, input).join(' ')).toMatch(/whole count/);
    expect(validateRegister(ts, input).join(' ')).toMatch(/another form/);
    expect(validateRegister(ts, input).join(' ')).toMatch(/unique positive/);
    const other = sample(mh('Q'));
    other.particulars = { regularWorkers: 0 };
    expect(validateRegister(mh('Q'), other).join(' ')).toMatch(/another form/);
  });
  it('prints both parts and a separate contractor certification with identity', async () => {
    const input = sample(ts);
    input.contractorUserId = '22222222-2222-4222-8222-222222222222';
    expect(validateRegister(ts, input).join(' ')).toMatch(
      /principal-employer representative/,
    );
    Object.assign(input.particulars!, {
      peSignatory: 'Fictional representative',
      peDesignation: 'Branch manager',
    });
    expect(validateRegister(ts, input)).toEqual([]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await registerWorkbook(ts, input)) as any);
    expect(book.worksheets.map((s) => s.name)).toEqual([
      'Identity and review',
      'Form II',
      'Form III',
    ]);
    const text = JSON.stringify(
      book.getWorksheet('Form III')!.getSheetValues(),
    );
    expect(text).toContain(
      'Certificate for authentication by the principal employer',
    );
    expect(text).toContain('Fictional representative');
  });
  it('allows a client company to act as contractor without registering itself as its own vendor', async () => {
    const input = sample(ts);
    input.actingCapacity = 'CONTRACTOR';
    expect(input.contractorUserId).toBeUndefined();
    expect(validateRegister(ts, input).join(' ')).toMatch(
      /principal-employer representative/,
    );
    Object.assign(input.particulars!, {
      principalEmployer: 'Other Company, customer work-site address',
      peSignatory: 'Customer representative',
      peDesignation: 'Site manager',
    });
    expect(validateRegister(ts, input)).toEqual([]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await registerWorkbook(ts, input)) as any);
    expect(
      JSON.stringify(
        book.getWorksheet('Identity and review')!.getSheetValues(),
      ),
    ).toContain('CONTRACTOR');
    expect(
      JSON.stringify(book.getWorksheet('Form III')!.getSheetValues()),
    ).toContain('Customer representative');
    delete input.actingCapacity;
    expect(validateRegister(ts, input).join(' ')).toMatch(
      /Client login does not establish/,
    );
  });
  it('checks Maharashtra daily attendance, overtime and deduction totals', async () => {
    const input = sample(mh('Q'));
    expect(validateRegister(mh('Q'), input)).toEqual([]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await registerWorkbook(mh('Q'), input)) as any);
    expect(
      JSON.stringify(book.getWorksheet('Form Q')!.getSheetValues()),
    ).toContain('00012345678901234567890');
    input.rows[0].day31Status = 'P';
    input.rows[0].pf = 1801;
    expect(validateRegister(mh('Q'), input).join(' ')).toMatch(
      /day 31 does not exist/,
    );
    expect(validateRegister(mh('Q'), input).join(' ')).toMatch(
      /deductions does not reconcile/,
    );
    input.rows[0].net = 16200;
    expect(validateRegister(mh('Q'), input).join(' ')).toMatch(
      /net does not reconcile/,
    );
  });
  it('requires Maharashtra leave refusals and balances to agree with the evidence', () => {
    const input = sample(mh('O'));
    expect(validateRegister(mh('O'), input)).toEqual([]);
    Object.assign(input.rows[0], {
      applicationDate: '2026-09-02',
      refusalDate: '2026-09-01',
      FestivalTotal: 3,
      FestivalUsed: 1,
      FestivalBalance: 3,
    });
    expect(validateRegister(mh('O'), input).join(' ')).toMatch(
      /precedes applicationDate/,
    );
    expect(validateRegister(mh('O'), input).join(' ')).toMatch(
      /refusal reason/,
    );
    expect(validateRegister(mh('O'), input).join(' ')).toMatch(
      /FestivalTotal does not reconcile/,
    );
  });
  it('uses the specific state Act applicability decision and rejects Code-only approval', async () => {
    const decision = {
      applicable: true,
      computedAt: '2026-09-14',
      factsUpdatedAt: '2026-09-13',
      factState: 'TS',
      government: 'STATE',
    };
    const query = jest.fn().mockResolvedValue([decision]);
    const ds: any = {
      query,
      getRepository: () => ({
        findOneBy: async () => ({
          id: '11111111-1111-4111-8111-111111111111',
          clientId: 'client',
          stateCode: 'TS',
        }),
      }),
    };
    const access: any = {
      assertBranchAllowed: jest.fn(),
      assertCcoBranchAllowed: jest.fn(),
      assertClientAllowed: jest.fn(),
    };
    const service = new RegisterBuilderService(ds, access);
    await service.context(ts, sample(ts).branchId, 2026, 9, {} as any);
    expect(query.mock.calls[0][1]).toEqual([
      sample(ts).branchId,
      'TS_SHOPS_1988',
    ]);
    query.mockResolvedValue([]);
    await expect(
      service.context(ts, sample(ts).branchId, 2026, 9, {} as any),
    ).rejects.toThrow(/TS_SHOPS_1988 applicability/);
    query.mockResolvedValue([{ ...decision, government: 'CENTRAL' }]);
    await expect(
      service.context(ts, sample(ts).branchId, 2026, 9, {} as any),
    ).rejects.toThrow(/appropriate government/);
  });
});
