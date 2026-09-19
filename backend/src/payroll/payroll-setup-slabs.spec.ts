import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PayrollSetupController } from './payroll-setup.controller';
import { PayrollConfigurationScopeGuard } from './payroll-configuration-scope.guard';
import { PayrollSetupService } from './payroll-setup.service';
import { SaveSlabsDto } from './dto/payroll-setup.dto';
import { createGlobalValidationPipe } from '../common/validators/global-validation-pipe';

describe('payroll/setup', () => {
  it('is behind the payroll configuration scope guard', () => {
    // The global ScopeGuard checks :clientId only; the rule and slab routes act
    // on ids, so without this a caller's own clientId fronted anyone's rule.
    const guards = Reflect.getMetadata(GUARDS_METADATA, PayrollSetupController);
    expect(guards).toContain(PayrollConfigurationScopeGuard);
  });

  describe('SaveSlabsDto through the global pipe', () => {
    const pipe = createGlobalValidationPipe();
    const run = (body: unknown) =>
      pipe.transform(body, { type: 'body', metatype: SaveSlabsDto, data: '' });

    it('accepts slabs as listSlabs() returns them, ids and all', async () => {
      const out = await run({
        slabs: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            ruleId: '00000000-0000-4000-8000-000000000002',
            fromAmount: '0',
            toAmount: '15000',
            slabPct: null,
            slabFixed: '150',
          },
        ],
      });
      expect(out.slabs[0].fromAmount).toBe(0);
      expect(out.slabs[0].toAmount).toBe(15000);
    });

    it('rejects a column the entity does not have', async () => {
      await expect(
        run({ slabs: [{ fromAmount: 0, clientId: 'someone-else' }] }),
      ).rejects.toThrow();
    });

    it('rejects a negative amount', async () => {
      await expect(run({ slabs: [{ fromAmount: -1 }] })).rejects.toThrow();
    });
  });

  describe('saveSlabs()', () => {
    let writes: { op: string; value: unknown }[];
    let service: PayrollSetupService;
    const RULE = 'rule-1';

    beforeEach(() => {
      writes = [];
      const em = {
        delete: jest.fn(async (_e: unknown, where: unknown) => {
          writes.push({ op: 'delete', value: where });
        }),
        save: jest.fn(async (value: unknown) => {
          writes.push({ op: 'save', value });
          return value;
        }),
      };
      const ruleRepo = {
        findOne: jest.fn(async () => ({
          id: RULE,
          componentId: 'comp-1',
          clientId: null,
        })),
      };
      const compRepo = {
        findOne: jest.fn(async () => ({ id: 'comp-1', clientId: 'client-a' })),
      };
      const slabRepo = {
        create: jest.fn((v) => ({ ...v })),
        manager: { transaction: jest.fn(async (work: any) => work(em)) },
      };
      service = new PayrollSetupService(
        {} as never,
        compRepo as never,
        ruleRepo as never,
        slabRepo as never,
      );
    });

    it('replaces the slabs with named fields, the path rule and the owning client', async () => {
      await service.saveSlabs(RULE, {
        slabs: [
          {
            id: 'x',
            ruleId: 'other-rule',
            fromAmount: 15000,
            toAmount: null,
            slabPct: 1.5,
          },
          { fromAmount: 0, toAmount: 15000, slabFixed: 150 },
        ],
      });
      expect(writes[0]).toEqual({ op: 'delete', value: { ruleId: RULE } });
      expect(writes[1].value).toEqual([
        {
          ruleId: RULE,
          clientId: 'client-a',
          fromAmount: '0',
          toAmount: '15000',
          slabPct: null,
          slabFixed: '150',
        },
        {
          ruleId: RULE,
          clientId: 'client-a',
          fromAmount: '15000',
          toAmount: null,
          slabPct: '1.5',
          slabFixed: null,
        },
      ]);
    });

    it('rejects overlapping bands before touching the stored slabs', async () => {
      await expect(
        service.saveSlabs(RULE, {
          slabs: [
            { fromAmount: 0, toAmount: 20000 },
            { fromAmount: 15000, toAmount: null },
          ],
        }),
      ).rejects.toThrow('overlap');
      expect(writes).toEqual([]);
    });

    it('rejects a band whose end is below its start', async () => {
      await expect(
        service.saveSlabs(RULE, {
          slabs: [{ fromAmount: 500, toAmount: 100 }],
        }),
      ).rejects.toThrow('below fromAmount');
      expect(writes).toEqual([]);
    });
  });
});
