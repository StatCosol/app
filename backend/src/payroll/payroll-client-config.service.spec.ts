import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PayrollClientConfigService } from './payroll-client-config.service';
import { PayrollService } from './payroll.service';

const user = { id: 'user', roleCode: 'PAYROLL' } as any;
const clientId = 'client';
const layout = { sections: [], settings: { currency: 'INR' } };
type ConfigurationOperation = (...args: any[]) => Promise<unknown>;

function harness() {
  const master = { find: jest.fn().mockResolvedValue([]) };
  const overrides = {
    find: jest.fn().mockResolvedValue([]),
    manager: { transaction: jest.fn() },
  };
  const layouts = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((row) => row),
    save: jest.fn(async (row) => row),
  };
  const scope = {
    assertPayrollAccessToClient: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PayrollClientConfigService(
    master as any,
    overrides as any,
    layouts as any,
    scope as any,
  );
  return { service, master, overrides, layouts, scope };
}

const operations = [
  ['getClientEffectiveComponents', []],
  ['saveClientComponentOverrides', [{ items: [] }]],
  ['getClientPayslipLayout', []],
  ['saveClientPayslipLayout', [{ layout }]],
] as const;

describe.each(operations)('%s access and delegation', (method, args) => {
  it.each([
    [{ roleCode: 'PAYROLL' }, clientId, BadRequestException],
    [{ id: 'user', roleCode: 'CLIENT' }, clientId, ForbiddenException],
    [user, '', BadRequestException],
  ])(
    'rejects invalid caller or client before database access',
    async (caller, client, error) => {
      const h = harness();
      await expect(
        (h.service[method] as ConfigurationOperation)(caller, client, ...args),
      ).rejects.toThrow(error);
      expect(h.scope.assertPayrollAccessToClient).not.toHaveBeenCalled();
      expect(h.master.find).not.toHaveBeenCalled();
      expect(h.overrides.find).not.toHaveBeenCalled();
      expect(h.overrides.manager.transaction).not.toHaveBeenCalled();
      expect(h.layouts.findOne).not.toHaveBeenCalled();
    },
  );

  it('rejects unassigned clients before database access', async () => {
    const h = harness();
    h.scope.assertPayrollAccessToClient.mockRejectedValue(
      new ForbiddenException(),
    );
    await expect(
      (h.service[method] as ConfigurationOperation)(user, clientId, ...args),
    ).rejects.toThrow(ForbiddenException);
    expect(h.scope.assertPayrollAccessToClient).toHaveBeenCalledWith(
      user,
      clientId,
    );
    expect(h.master.find).not.toHaveBeenCalled();
    expect(h.overrides.find).not.toHaveBeenCalled();
    expect(h.overrides.manager.transaction).not.toHaveBeenCalled();
    expect(h.layouts.findOne).not.toHaveBeenCalled();
  });

  it('preserves arguments, results and errors through the existing payroll service', async () => {
    const result = { existingResponse: true };
    const delegate = jest.fn().mockResolvedValue(result);
    const facade = Object.assign(Object.create(PayrollService.prototype), {
      clientConfigService: { [method]: delegate },
    });
    await expect(facade[method](user, clientId, ...args)).resolves.toBe(result);
    expect(delegate).toHaveBeenCalledTimes(1);
    expect(delegate).toHaveBeenCalledWith(user, clientId, ...args);
    const error = new ForbiddenException();
    delegate.mockRejectedValue(error);
    await expect(facade[method](user, clientId, ...args)).rejects.toBe(error);
  });
});

describe('effective payroll components', () => {
  it('preserves defaults, explicit false flags, disabled filtering and display order', async () => {
    const h = harness();
    h.master.find.mockResolvedValue([
      {
        id: 'basic',
        code: 'BASIC',
        name: 'Basic',
        componentType: 'EARNING',
        isTaxable: true,
        affectsPfWage: true,
        affectsEsiWage: false,
        defaultFormula: 'GROSS * 0.5',
      },
      { id: 'z', code: 'Z', name: 'Z' },
      { id: 'a', code: 'A', name: 'A' },
      { id: 'hidden', code: 'HIDDEN' },
    ]);
    h.overrides.find.mockResolvedValue([
      {
        componentId: 'z',
        displayOrder: 0,
        labelOverride: 'Custom Z',
        formulaOverride: '10',
        showOnPayslip: false,
      },
      { componentId: 'a', displayOrder: 0 },
      { componentId: 'hidden', enabled: false },
    ]);
    const result = await h.service.getClientEffectiveComponents(user, clientId);
    expect(result.map((row) => row.code)).toEqual(['A', 'Z', 'BASIC']);
    expect(result[1]).toMatchObject({
      name: 'Custom Z',
      formula: '10',
      displayOrder: 0,
      showOnPayslip: false,
      enabled: true,
    });
    expect(result[2]).toEqual({
      componentId: 'basic',
      code: 'BASIC',
      name: 'Basic',
      componentType: 'EARNING',
      isTaxable: true,
      affectsPfWage: true,
      affectsEsiWage: false,
      enabled: true,
      showOnPayslip: true,
      displayOrder: null,
      formula: 'GROSS * 0.5',
    });
    expect(h.master.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { code: 'ASC' },
    });
    expect(h.overrides.find).toHaveBeenCalledWith({ where: { clientId } });
  });

  it('allows administrators and restores master defaults for null overrides', async () => {
    const h = harness();
    h.master.find.mockResolvedValue([
      { id: 'basic', code: 'BASIC', name: 'Basic', defaultFormula: '10' },
    ]);
    h.overrides.find.mockResolvedValue([
      {
        componentId: 'basic',
        enabled: null,
        labelOverride: null,
        formulaOverride: null,
        showOnPayslip: null,
      },
    ]);
    const result = await h.service.getClientEffectiveComponents(
      { ...user, roleCode: 'ADMIN' },
      clientId,
    );
    expect(result).toEqual([
      expect.objectContaining({
        name: 'Basic',
        formula: '10',
        enabled: true,
        showOnPayslip: true,
      }),
    ]);
  });
});

describe('payroll layout configuration', () => {
  it('returns an active stored layout without changing its shape', async () => {
    const h = harness();
    h.layouts.findOne.mockResolvedValue({ layoutJson: layout });
    await expect(
      h.service.getClientPayslipLayout(user, clientId),
    ).resolves.toBe(layout);
    expect(h.layouts.findOne).toHaveBeenCalledWith({
      where: { clientId, isActive: true },
    });
  });

  it('returns independent default layouts when none is stored', async () => {
    const h = harness();
    const first = await h.service.getClientPayslipLayout(user, clientId);
    expect(first.sections.map((section) => section.key)).toEqual([
      'EARNINGS',
      'DEDUCTIONS',
      'SUMMARY',
    ]);
    expect(first.settings).toEqual({
      showRates: false,
      showUnits: false,
      currency: 'INR',
    });
    first.sections[0].title = 'Changed';
    const second = await h.service.getClientPayslipLayout(user, clientId);
    expect(second.sections[0].title).toBe('Earnings');
  });

  it.each([
    [{}, 'layout required'],
    [{ layout: {} }, 'layout.sections must be array'],
    [{ layout: { sections: [{ rows: {} }] } }, 'section.rows must be array'],
    [
      { layout: { sections: [{ rows: [{ type: 'COMPONENT' }] }] } },
      'COMPONENT row must have code',
    ],
    [
      {
        layout: {
          sections: [{ rows: [{ type: 'COMPONENT', code: 'UNKNOWN' }] }],
        },
      },
      'Component code not enabled',
    ],
  ])('rejects invalid layouts without saving', async (dto, message) => {
    const h = harness();
    await expect(
      h.service.saveClientPayslipLayout(user, clientId, dto as any),
    ).rejects.toThrow(message);
    expect(h.layouts.save).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { id: 'saved-layout', clientId, isActive: false, layoutJson: {} },
  ])(
    'creates or reactivates layouts for enabled components',
    async (existing) => {
      const h = harness();
      h.layouts.findOne.mockResolvedValue(existing);
      h.master.find.mockResolvedValue([{ id: 'basic', code: 'BASIC' }]);
      const value = {
        sections: [
          {
            rows: [
              { type: 'COMPONENT', code: 'BASIC' },
              { type: 'TOTAL', key: 'NET_PAY' },
            ],
          },
        ],
      };
      await expect(
        h.service.saveClientPayslipLayout(user, clientId, { layout: value }),
      ).resolves.toBe(value);
      expect(h.layouts.save).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId,
          isActive: true,
          layoutJson: value,
        }),
      );
      if (existing) {
        expect(h.layouts.save).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'saved-layout' }),
        );
        expect(h.layouts.create).not.toHaveBeenCalled();
      } else {
        expect(h.layouts.create).toHaveBeenCalledTimes(1);
      }
    },
  );
});
