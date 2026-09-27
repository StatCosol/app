import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PayrollConfigController } from './payroll.config.controller';
import { PayrollConfigAuditService } from './payroll-config-audit.service';
import { PayrollClientConfigService } from './payroll-client-config.service';
import { PayrollClientComponentOverrideEntity } from './entities/payroll-client-component-override.entity';
import { SaveComponentOverridesDto } from './dto/payroll-config.dto';

describe('payroll configuration history access', () => {
  it('rejects history access before reading an unassigned client', async () => {
    const history = { getHistory: jest.fn() };
    const scope = {
      assertPayrollAccessToClient: jest
        .fn()
        .mockRejectedValue(new ForbiddenException()),
    };
    const controller = new PayrollConfigController(
      {} as any,
      history as any,
      scope as any,
    );
    await expect(
      controller.getConfigAudit(
        { id: 'user', roleCode: 'PAYROLL' } as any,
        'other-client',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(history.getHistory).not.toHaveBeenCalled();
  });

  it('loads history for an assigned client', async () => {
    const history = { getHistory: jest.fn().mockResolvedValue([]) };
    const scope = {
      assertPayrollAccessToClient: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new PayrollConfigController(
      {} as any,
      history as any,
      scope as any,
    );
    await expect(
      controller.getConfigAudit(
        { id: 'user', roleCode: 'PAYROLL' } as any,
        'client',
        undefined,
        '50',
      ),
    ).resolves.toEqual([]);
    expect(history.getHistory).toHaveBeenCalledWith('client', {
      entityType: undefined,
      limit: 50,
    });
  });

  it.each([0, -1, 501, NaN, Infinity, 1.5])(
    'rejects invalid history limit %s',
    async (limit) => {
      const repo = { createQueryBuilder: jest.fn() };
      await expect(
        new PayrollConfigAuditService(repo as any).getHistory('client', {
          limit,
        }),
      ).rejects.toThrow('limit must');
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    },
  );
});

describe('payroll component override persistence', () => {
  function harness() {
    const existing = {
      id: 'override',
      componentId: 'component',
      enabled: false,
      showOnPayslip: false,
      displayOrder: 7,
      labelOverride: 'Base pay',
      formulaOverride: 'GROSS * 0.5',
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest.fn(async (row) => row),
      create: jest.fn((row) => row),
    };
    const audit = { save: jest.fn().mockResolvedValue({}) };
    const manager = {
      query: jest.fn(),
      getRepository: jest.fn((entity) =>
        entity === PayrollClientComponentOverrideEntity ? repo : audit,
      ),
    };
    const transaction = jest.fn(async (callback) => callback(manager));
    const service = Object.assign(
      Object.create(PayrollClientConfigService.prototype),
      {
        scopeService: { assertPayrollAccessToClient: jest.fn() },
        compRepo: { find: jest.fn().mockResolvedValue([{ id: 'component' }]) },
        overrideRepo: { manager: { transaction } },
        getClientEffectiveComponents: jest.fn().mockResolvedValue([]),
      },
    );
    const save = (items: any[]) =>
      service.saveClientComponentOverrides(
        { id: 'user', roleCode: 'PAYROLL' },
        'client',
        { items },
      );
    return { service, save, repo, audit, transaction };
  }

  it('preserves omitted settings and records previous values in the transaction', async () => {
    const h = harness();
    await h.save([{ componentId: 'component', labelOverride: 'Updated pay' }]);
    expect(h.repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        showOnPayslip: false,
        displayOrder: 7,
        formulaOverride: 'GROSS * 0.5',
        labelOverride: 'Updated pay',
      }),
    );
    expect(h.audit.save).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client',
        userId: 'user',
        oldValues: expect.objectContaining({ labelOverride: 'Base pay' }),
        newValues: expect.objectContaining({ labelOverride: 'Updated pay' }),
      }),
    );
    expect(h.transaction).toHaveBeenCalledTimes(1);
  });

  it('clears only explicitly reset overrides', async () => {
    const h = harness();
    await h.save([
      {
        componentId: 'component',
        labelOverride: null,
        formulaOverride: '',
        displayOrder: null,
      },
    ]);
    expect(h.repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        labelOverride: null,
        formulaOverride: null,
        displayOrder: null,
      }),
    );
  });

  it('rejects unknown components before writing any overrides', async () => {
    const h = harness();
    h.service.compRepo.find.mockResolvedValue([]);
    await expect(h.save([{ componentId: 'unknown' }])).rejects.toThrow(
      'Unknown payroll component',
    );
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate components before writing', async () => {
    const h = harness();
    await expect(
      h.save([{ componentId: 'component' }, { componentId: 'component' }]),
    ).rejects.toThrow('Duplicate');
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('propagates an audit failure so the transaction cannot commit', async () => {
    const h = harness();
    h.audit.save.mockRejectedValue(new Error('audit unavailable'));
    await expect(
      h.save([{ componentId: 'component', enabled: true }]),
    ).rejects.toThrow('audit unavailable');
    expect(h.service.getClientEffectiveComponents).not.toHaveBeenCalled();
  });

  it('validates component IDs and integer ordering on the endpoint', async () => {
    const errors = await validate(
      plainToInstance(SaveComponentOverridesDto, {
        items: [{ componentId: 'invalid', displayOrder: 1.5 }],
      }),
    );
    expect(errors).not.toHaveLength(0);
  });
});
