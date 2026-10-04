import { PayrollEngineService } from './payroll-engine.service';
import { StructureResolverService } from './structure-resolver.service';
import { WageBaseService } from './wage-base.service';
import { RoundingService } from './rounding.service';

const scope = {
  clientId: 'client',
  branchId: 'branch',
  employeeId: null,
  departmentId: null,
  gradeId: null,
  asOfDate: '2026-10-04',
};
function fixture() {
  const structure = {
    id: 'draft',
    clientId: 'client',
    scopeType: 'TENANT',
    ruleSetId: 'rules',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    isActive: false,
    approvalStatus: 'DRAFT',
  };
  const structureRepo = {
    findOne: jest.fn(async ({ where }) =>
      where.clientId === structure.clientId && where.id === structure.id
        ? structure
        : null,
    ),
  };
  const items = [
    {
      id: 'item',
      componentId: 'basic',
      calcMethod: 'FORMULA',
      formula: 'ACTUAL_GROSS',
      priority: 1,
    },
  ];
  const itemRepo = { find: jest.fn().mockResolvedValue(items) };
  const resolver = new StructureResolverService(
    structureRepo as any,
    itemRepo as any,
  );
  const service: PayrollEngineService = Object.assign(
    Object.create(PayrollEngineService.prototype),
    {
      setupRepo: {
        findOne: jest
          .fn()
          .mockResolvedValue({ pfEnabled: false, esiEnabled: false }),
      },
      compRepo: {
        find: jest
          .fn()
          .mockResolvedValue([
            { id: 'basic', code: 'BASIC', componentType: 'EARNING' },
          ]),
      },
      structureResolver: resolver,
      rulesetResolver: {
        resolveAndLoad: jest.fn().mockResolvedValue({ params: new Map() }),
      },
      resolveClientScheduledEmployment: jest.fn().mockResolvedValue(null),
      resolveMinWage: jest.fn().mockResolvedValue(13500),
      resolveWorkStateCode: jest.fn().mockResolvedValue(''),
      statutory: {
        compute: jest
          .fn()
          .mockReturnValue({ values: { PF_EMP: 1800, EPS_WAGES: 0 } }),
      },
      wageBase: new WageBaseService(),
      rounding: new RoundingService(),
    },
  );
  return { service, resolver, structure, structureRepo, itemRepo, items };
}

describe('Saved salary structure preview', () => {
  it('calculates a selected draft without changing its approval or activation state', async () => {
    const { service, structure } = fixture();
    const values = await service.previewEmployee({
      ...scope,
      structureId: 'draft',
      grossAmount: 25000,
    });
    expect(values).toMatchObject({
      BASIC: 25000,
      GROSS: 25000,
      NET_PAY: 23200,
      MIN_WAGE: 13500,
    });
    expect(structure).toMatchObject({
      isActive: false,
      approvalStatus: 'DRAFT',
    });
  });
  it('rejects a structure from another client or outside the date/scope context', async () => {
    const { resolver, structure } = fixture();
    await expect(
      resolver.resolvePreview({ ...scope, clientId: 'other' }, 'draft'),
    ).rejects.toThrow('not found');
    await expect(
      resolver.resolvePreview({ ...scope, asOfDate: '2025-12-31' }, 'draft'),
    ).rejects.toThrow('effective dates');
    structure.scopeType = 'BRANCH';
    Object.assign(structure, { branchId: 'other' });
    await expect(resolver.resolvePreview(scope, 'draft')).rejects.toThrow(
      'scope',
    );
  });
  it('rejects empty or orphaned mappings instead of returning wage inputs as a successful preview', async () => {
    const { service, itemRepo } = fixture();
    itemRepo.find.mockResolvedValueOnce([]);
    await expect(
      service.previewEmployee({
        ...scope,
        structureId: 'draft',
        grossAmount: 25000,
      }),
    ).rejects.toThrow('enabled component mappings');
    itemRepo.find.mockResolvedValueOnce([{ componentId: 'deleted' }]);
    await expect(
      service.previewEmployee({
        ...scope,
        structureId: 'draft',
        grossAmount: 25000,
      }),
    ).rejects.toThrow('missing or inactive');
  });
  it('reports formula errors rather than displaying a successful zero', async () => {
    const { service, items } = fixture();
    items[0].formula = 'UNKNOWN_FUNCTION(1)';
    await expect(
      service.previewEmployee({
        ...scope,
        structureId: 'draft',
        grossAmount: 25000,
      }),
    ).rejects.toThrow("Unknown function 'UNKNOWN_FUNCTION'");
  });
  it('reports an unresolved live structure instead of a statutory-only fallback', async () => {
    const { service, resolver } = fixture();
    jest.spyOn(resolver, 'resolve').mockResolvedValue(null);
    await expect(
      service.previewEmployee({ ...scope, grossAmount: 25000 }),
    ).rejects.toThrow('No approved active structure');
  });
});
