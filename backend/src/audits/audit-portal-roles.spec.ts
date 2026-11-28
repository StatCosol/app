import { Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/roles.guard';
import {
  CrmAuditsController,
  ClientAuditsController,
} from './audits.controller';

describe('Audit portal role boundaries', () => {
  const guard = new RolesGuard(new Reflector());
  beforeAll(() =>
    jest.spyOn(Logger, 'warn').mockImplementation(() => undefined),
  );
  afterAll(() => jest.restoreAllMocks());

  for (const [controller, role] of [
    [CrmAuditsController, 'CRM'],
    [ClientAuditsController, 'CLIENT'],
  ] as const) {
    for (const method of Object.getOwnPropertyNames(controller.prototype)) {
      if (method === 'constructor') continue;
      const handler = controller.prototype[method];
      if (!Reflect.hasMetadata('path', handler)) continue;
      const context = (roleCode: string) =>
        ({
          getHandler: () => handler,
          getClass: () => controller,
          switchToHttp: () => ({ getRequest: () => ({ user: { roleCode } }) }),
        }) as any;
      it(`${controller.name}.${method} admits ${role} and denies Admin/other portal roles`, () => {
        expect(guard.canActivate(context(role))).toBe(true);
        for (const denied of [
          'ADMIN',
          'AUDITOR',
          'CONTRACTOR',
          role === 'CRM' ? 'CLIENT' : 'CRM',
        ]) {
          expect(() => guard.canActivate(context(denied))).toThrow(
            'permission',
          );
        }
      });
    }
  }
});
