import * as ExcelJS from 'exceljs';
import { RegisterBuilderService } from './register-builder.service';
import { RegisterLibraryController } from './register-library.controller';
import { RegisterLibraryService } from './register-library.service';
import {
  definition,
  registerWorkbook,
  validateRegister,
  RegisterInput,
} from './register-workbook';
import {
  legalRegisterType,
  registerIdentity,
  LEGAL_WAGE_REGISTER_TYPES,
} from './register-identity';

const factory = 'ts--factories-1948--ts-integrated-2019--ii---iii--tsi';
const shops = 'ts--shops-1988--ts-integrated-2019--ii---iii--tsi';
const branchId = '94ad1c42-ea05-460e-b494-0a7e634de127';

describe('Telangana factory integrated register', () => {
  let builder: RegisterBuilderService,
    controller: RegisterLibraryController,
    query: jest.Mock;
  let decision: any, branch: any;
  beforeEach(() => {
    decision = {
      applicable: true,
      computedAt: '2026-10-02',
      factsUpdatedAt: '2026-10-01',
      government: 'STATE',
      factState: 'TS',
      establishmentType: 'FACTORY',
      isBocwProject: false,
    };
    branch = {
      id: branchId,
      clientId: 'client',
      branchName: 'BRM',
      stateCode: 'TS',
    };
    query = jest.fn(async (_sql, params) => [
      {
        ...decision,
        applicable: params[1] === 'FACTORIES' && decision.applicable,
      },
    ]);
    builder = new RegisterBuilderService(
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
    controller = new RegisterLibraryController({} as any, builder, {} as any);
  });
  const check = () =>
    controller.eligibility(factory, branchId, '2026', '3', {} as any);

  it('uses the existing FACTORIES decision and never requires enabling Shops', async () => {
    expect(await check()).toMatchObject({ eligible: true, branchName: 'BRM' });
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      branchId,
      'FACTORIES',
    ]);
    expect(
      await controller.eligibility(shops, branchId, '2026', '3', {} as any),
    ).toMatchObject({ eligible: false });
    expect(definition(factory).form.applicabilityCode).toBe('FACTORIES');
  });
  it.each([
    ['government', 'CENTRAL', 'appropriate government'],
    ['government', null, 'appropriate government'],
    ['establishmentType', 'ESTABLISHMENT', 'requires a factory'],
    ['applicable', false, 'applicability'],
    ['factsUpdatedAt', '2026-10-03', 'Recompute'],
  ])('blocks invalid %s = %s', async (key, value, reason) => {
    decision[key] = value;
    expect(await check()).toEqual({
      eligible: false,
      reason: expect.stringContaining(reason),
    });
  });
  it('does not treat construction-only work as a factory', async () => {
    decision.establishmentType = 'ESTABLISHMENT';
    decision.isBocwProject = true;
    expect(await check()).toMatchObject({
      eligible: false,
      reason: expect.stringContaining('requires a factory'),
    });
  });
  it('rejects a different state even with a Factory decision', async () => {
    branch.stateCode = 'AP';
    expect(await check()).toMatchObject({
      eligible: false,
      reason: expect.stringContaining('different state'),
    });
    expect(query).not.toHaveBeenCalled();
  });
  it('keeps identities and wage restrictions separate while offering the factory layout', () => {
    const forms = new RegisterLibraryService().list('TS').forms;
    expect(forms.find((f) => f.id === factory)?.preparationAvailable).toBe(
      true,
    );
    expect(
      forms
        .filter((f) => f.actCode === 'MULTI_ACT')
        .every((f) => !f.preparationAvailable),
    ).toBe(true);
    expect(legalRegisterType(factory)).not.toBe(legalRegisterType(shops));
    expect(registerIdentity(legalRegisterType(factory))?.actCode).toBe(
      'FACTORIES_1948',
    );
    expect(LEGAL_WAGE_REGISTER_TYPES).toContain(legalRegisterType(factory));
  });
  it('exports both prescribed parts and requires complete particulars and reviewed capacity', async () => {
    const layout = definition(factory).layout;
    const values = (fields: typeof layout.fields) =>
      Object.fromEntries(
        fields
          .filter((f) => f.required)
          .map((f) => [
            f.key,
            ['number', 'money'].includes(f.type)
              ? 0
              : 'Reviewed fictional evidence',
          ]),
      );
    const input = {
      branchId,
      year: 2026,
      month: 3,
      employer: 'Fictional factory',
      owner: 'Fictional owner',
      registrationNumber: 'TEST-001',
      employerPan: 'ABCDE1234F',
      issueDate: '2026-03-31',
      supportingReference: 'Reviewed source records and period applicability',
      actingCapacity: 'DIRECT_EMPLOYER',
      particulars: {
        ...values(layout.particulars!),
        regularWorkers: 1,
        categoryPermanentMale: 1,
        categoryTotalMale: 1,
        classSkilledMale: 1,
        classTotalMale: 1,
      },
      rows: [
        {
          ...values(layout.fields),
          serial: 1,
          name: 'Factory worker',
          sex: 'M',
          gross: 1000,
          net: 1000,
        },
      ],
    } as RegisterInput;
    expect(validateRegister(factory, input)).toEqual([]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await registerWorkbook(factory, input)) as any);
    expect(book.worksheets.map((s) => s.name)).toEqual([
      'Identity and review',
      'Form II',
      'Form III',
    ]);
    expect(book.getWorksheet('Form III')!.getCell('B6').value).toBe(
      'Factory worker',
    );
    expect(
      JSON.stringify(
        book.getWorksheet('Identity and review')!.getSheetValues(),
      ),
    ).toContain('FACTORIES_1948');
    expect(
      validateRegister(factory, { ...input, particulars: undefined }).join(' '),
    ).toContain('both parts');
    expect(
      validateRegister(factory, { ...input, actingCapacity: undefined }).join(
        ' ',
      ),
    ).toContain('capacity');
  });
});
