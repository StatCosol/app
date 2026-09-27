import { defaultPayslipLayout, validatePayslipLayout } from './payslip-layout';
import { PayrollService } from '../payroll.service';
import { PayrollClientPayslipLayoutEntity } from '../entities/payroll-client-payslip-layout.entity';

describe('Payslip layout contract', () => {
  it('keeps existing payslips unchanged until explicitly enabled', () => {
    const layout: any = defaultPayslipLayout();
    delete layout.settings.enabled;
    expect(validatePayslipLayout(layout).settings.enabled).toBe(false);
    layout.settings.enabled = true;
    expect(validatePayslipLayout(layout).settings.enabled).toBe(true);
  });
  it('preserves chosen order and labels without formulas or editable totals', () => {
    const layout = defaultPayslipLayout();
    layout.sections[0].rows = [
      { type: 'COMPONENT', code: 'BASIC', label: 'Base Salary' },
    ];
    expect(validatePayslipLayout(layout, new Set(['BASIC']))).toEqual(layout);
  });
  it.each([
    (l: any) => {
      l.sections = [];
    },
    (l: any) => {
      l.sections[1].key = 'EARNINGS';
    },
    (l: any) => {
      l.sections[0].totals = [];
    },
    (l: any) => {
      l.sections[0].rows = [{ type: 'FORMULA', label: 'Unsafe' }];
    },
    (l: any) => {
      l.sections[0].rows = [
        { type: 'COMPONENT', code: 'FOREIGN', label: 'Unknown' },
      ];
    },
    (l: any) => {
      l.sections[0].title = ' ';
    },
    (l: any) => {
      l.sections[0].title = 'x'.repeat(81);
    },
    (l: any) => {
      l.sections[0].rows = [
        { type: 'TOTAL', key: 'NET_PAY', label: 'Wrong section' },
      ];
    },
    (l: any) => {
      l.sections[0].rows = Array(51).fill({
        type: 'COMPONENT',
        code: 'BASIC',
        label: 'Basic',
      });
    },
    (l: any) => {
      l.settings.showRates = true;
    },
    (l: any) => {
      l.settings.showUnits = true;
    },
    (l: any) => {
      l.settings.currency = 'USD';
    },
    (l: any) => {
      l.settings.enabled = 'true';
    },
  ])('rejects malformed or unsupported configuration %#', (mutate) => {
    const layout = defaultPayslipLayout();
    mutate(layout);
    expect(() => validatePayslipLayout(layout, new Set(['BASIC']))).toThrow();
  });
  it('rejects duplicate component amounts even across sections', () => {
    const layout = defaultPayslipLayout();
    layout.sections[0].rows.push({
      type: 'COMPONENT',
      code: 'BASIC',
      label: 'Basic',
    });
    layout.sections[1].rows.push({
      type: 'COMPONENT',
      code: 'BASIC',
      label: 'Duplicate',
    });
    expect(() => validatePayslipLayout(layout)).toThrow('unique');
  });
});

describe('Payslip layout persistence scope', () => {
  function setup() {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      save: jest.fn(async (row) => ({ id: 'layout', ...row })),
    };
    const scope = { assertPayrollAccessToClient: jest.fn() };
    const history = { save: jest.fn() };
    const manager = {
      query: jest.fn(),
      getRepository: jest.fn((entity) =>
        entity === PayrollClientPayslipLayoutEntity ? repo : history,
      ),
    };
    const transaction = jest.fn(async (callback) => callback(manager));
    const service = Object.assign(Object.create(PayrollService.prototype), {
      layoutRepo: { ...repo, manager: { transaction } },
      scopeService: scope,
      getClientEffectiveComponents: jest.fn().mockResolvedValue([
        { code: 'BASIC', enabled: true },
        { code: 'DISABLED', enabled: false },
      ]),
    });
    return { service, repo, scope, history, manager, transaction };
  }
  const user = { id: 'payroll', roleCode: 'PAYROLL' };
  it('checks assignment before reading or writing a layout', async () => {
    const h = setup();
    h.scope.assertPayrollAccessToClient.mockRejectedValue(
      new Error('Outside scope'),
    );
    await expect(
      h.service.getClientPayslipLayout(user, 'other'),
    ).rejects.toThrow('Outside scope');
    await expect(
      h.service.saveClientPayslipLayout(user, 'other', {
        layout: defaultPayslipLayout(),
      }),
    ).rejects.toThrow('Outside scope');
    expect(h.repo.findOne).not.toHaveBeenCalled();
    expect(h.repo.save).not.toHaveBeenCalled();
  });
  it('rejects enabling disabled component codes without writing', async () => {
    const h = setup();
    const layout = defaultPayslipLayout();
    layout.settings.enabled = true;
    layout.sections[0].rows.push({
      type: 'COMPONENT',
      code: 'DISABLED',
      label: 'Unavailable',
    });
    await expect(
      h.service.saveClientPayslipLayout(user, 'client', { layout }),
    ).rejects.toThrow('not enabled');
    expect(h.repo.save).not.toHaveBeenCalled();
  });
  it('persists only a validated layout for the requested client', async () => {
    const h = setup();
    const layout = defaultPayslipLayout();
    layout.settings.enabled = true;
    await expect(
      h.service.saveClientPayslipLayout(user, 'client', { layout }),
    ).resolves.toEqual(layout);
    expect(h.repo.save).toHaveBeenCalledWith({
      clientId: 'client',
      layoutJson: layout,
      isActive: true,
    });
    expect(h.manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['payroll-config:client'],
    );
    expect(h.history.save).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client',
        entityType: 'PayrollClientPayslipLayout',
        userId: 'payroll',
        action: 'CREATE',
      }),
    );
  });
  it('propagates history failure to roll back the configuration transaction', async () => {
    const h = setup();
    h.history.save.mockRejectedValue(new Error('history unavailable'));
    await expect(
      h.service.saveClientPayslipLayout(user, 'client', {
        layout: defaultPayslipLayout(),
      }),
    ).rejects.toThrow('history unavailable');
    expect(h.transaction).toHaveBeenCalledTimes(1);
  });
});
