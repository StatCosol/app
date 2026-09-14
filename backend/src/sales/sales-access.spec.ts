import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/roles.guard';
import { CeoSalesController, SalesLeadsController } from './sales.controller';
import { SalesService } from './sales.service';

describe('Sales belongs to CEO and Sales users', () => {
  const guard = new RolesGuard(new Reflector());
  for (const controller of [SalesLeadsController, CeoSalesController]) {
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[name];
      if (name === 'constructor' || name === 'receivables') continue;
      it(`${controller.name}.${name} rejects Admin and permits CEO`, () => {
        const context = (roleCode: string) =>
          ({
            getClass: () => controller,
            getHandler: () => handler,
            switchToHttp: () => ({
              getRequest: () => ({ user: { roleCode } }),
            }),
          }) as unknown as ExecutionContext;
        expect(() => guard.canActivate(context('ADMIN'))).toThrow(
          ForbiddenException,
        );
        expect(guard.canActivate(context('CEO'))).toBe(true);
        if (controller === SalesLeadsController) {
          expect(guard.canActivate(context('SALES'))).toBe(true);
        } else {
          expect(() => guard.canActivate(context('SALES'))).toThrow(
            ForbiddenException,
          );
        }
      });
    }
  }

  it('rejects Admin service operations before reading or writing lead data', async () => {
    const service = new SalesService({} as any, {} as any, {} as any);
    const admin = { id: 'admin', userId: 'admin', roleCode: 'ADMIN' };
    for (const operation of [
      () => service.create(admin, {} as any),
      () => service.list(admin, {}),
      () => service.summary(admin),
      () => service.findOne(admin, 'lead'),
      () => service.update(admin, 'lead', {}),
      () => service.remove(admin, 'lead'),
      () => service.myFollowups(admin),
      () => service.listActivities(admin, 'lead'),
      () => service.addActivity(admin, 'lead', {} as any),
    ]) {
      await expect(operation()).rejects.toThrow(ForbiddenException);
    }
  });
});
