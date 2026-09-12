/* eslint-disable @typescript-eslint/unbound-method -- Inspect decorator metadata without invoking the methods. */
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RolesGuard } from '../auth/roles.guard';
import { AutomationControlController } from './control-center.controller';
import { AutomationControlService } from './control-center.service';
import { ControlSettingsDto, ControlRunDto } from './control-center.dto';
import { ExpiryRemindersJob } from './jobs/expiry-reminders.job';
import { DueRemindersJob } from './jobs/due-reminders.job';
import { NonComplianceRemindersJob } from './jobs/non-compliance-reminders.job';
import { ReturnsFilingGeneratorJob } from './jobs/returns-filing-generator.job';
import { ReturnsFilingAutomationController } from './controllers/returns-filing-automation.controller';

const context = (
  role: string,
  controller: any = AutomationControlController,
  method = 'overview',
) =>
  ({
    getHandler: () => controller.prototype[method],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { roleCode: role } }) }),
  }) as any;
describe('Automation control authority and scheduler ownership', () => {
  const guard = new RolesGuard(new Reflector());
  it('allows administrators to manage settings', () =>
    expect(guard.canActivate(context('ADMIN'))).toBe(true));
  it.each([
    'CLIENT',
    'BRANCH_DESK',
    'CONTRACTOR',
    'CRM',
    'CCO',
    'CEO',
    'PAYROLL',
    'AUDITOR',
  ])('rejects %s on every control action', (role) => {
    for (const method of [
      'overview',
      'save',
      'preview',
      'run',
      'retry',
      'inherit',
      'history',
      'changes',
    ])
      expect(() =>
        guard.canActivate(context(role, AutomationControlController, method)),
      ).toThrow();
  });
  it('does not allow old CRM triggers to bypass administrator controls', () => {
    for (const method of ['generateRenewals', 'sendOverdueAlerts'])
      expect(() =>
        guard.canActivate(
          context('CRM', ReturnsFilingAutomationController, method),
        ),
      ).toThrow();
  });
  it('has one scheduler owner for the managed rules', () => {
    for (const fn of [
      ExpiryRemindersJob.prototype.handle,
      DueRemindersJob.prototype.handle,
      NonComplianceRemindersJob.prototype.handle,
      ReturnsFilingGeneratorJob.prototype.handleDailyRenewals,
      ReturnsFilingGeneratorJob.prototype.handleOverdueAlerts,
    ])
      expect(Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', fn)).toBeUndefined();
    expect(
      Reflect.getMetadata(
        'SCHEDULE_CRON_OPTIONS',
        AutomationControlService.prototype.tick,
      ),
    ).toMatchObject({ timeZone: 'Asia/Kolkata' });
    expect(
      Reflect.getMetadata(
        'SCHEDULE_CRON_OPTIONS',
        ReturnsFilingGeneratorJob.prototype.handleMonthlyFilings,
      ),
    ).toBeDefined();
  });
  it.each([
    { ruleKey: 'unrecognized' },
    { enabled: 'false' },
    { localTime: '25:00' },
    { localTime: '8:00' },
    { version: -1 },
    { clientId: 'wrong' },
  ])('rejects invalid settings %j', (patch) => {
    expect(
      validateSync(
        plainToInstance(ControlSettingsDto, {
          ruleKey: 'expiry',
          enabled: true,
          localTime: '07:00',
          version: 0,
          ...patch,
        }),
      ).length,
    ).toBeGreaterThan(0);
  });
  it('requires a preview digest and request identity for manual execution', () =>
    expect(validateSync(plainToInstance(ControlRunDto, {})).length).toBe(3));
});
