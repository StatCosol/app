import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { RolesGuard } from '../auth/roles.guard';
import { ClientContactsController } from './client-contacts.controller';
import { ClientContactsService } from './client-contacts.service';
import { ClientCommsCronService } from './client-comms-cron.service';
import { ClientCommTemplatesService } from './client-comm-templates.service';

describe('Client contact option ownership', () => {
  const user = { userId: 'cco-sample', roleCode: 'CCO' } as ReqUser;
  let controller: ClientContactsController;
  let svc: Record<string, jest.Mock>;
  let access: { assertCcoClientAllowed: jest.Mock };
  beforeEach(() => {
    svc = {
      getClientId: jest.fn().mockResolvedValue('assigned'),
      listForClient: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({ ok: true }),
    };
    access = {
      assertCcoClientAllowed: jest.fn(
        async (actor: ReqUser, client: string) => {
          if (actor.roleCode === 'CCO' && client !== 'assigned') {
            throw new ForbiddenException('Client not in CCO scope');
          }
        },
      ),
    };
    controller = new ClientContactsController(
      svc as unknown as ClientContactsService,
      {} as ClientCommsCronService,
      {} as ClientCommTemplatesService,
      access as unknown as AccessScopeService,
      {} as any,
    );
  });

  it('lists assigned contacts', async () => {
    await controller.list('assigned', user);
    expect(svc.listForClient).toHaveBeenCalledWith('assigned');
  });
  it('does not read foreign contacts', async () => {
    await expect(controller.list('foreign', user)).rejects.toThrow(
      ForbiddenException,
    );
    expect(svc.listForClient).not.toHaveBeenCalled();
  });
  it.each(['assigned', 'foreign'])(
    'checks creation ownership: %s',
    async (clientId) => {
      const promise = controller.create(
        {
          clientId,
          department: 'HR',
          name: 'Sample',
          email: 'test@example.invalid',
        },
        user,
      );
      if (clientId === 'assigned') {
        await promise;
        expect(svc.create).toHaveBeenCalled();
      } else {
        await expect(promise).rejects.toThrow(ForbiddenException);
        expect(svc.create).not.toHaveBeenCalled();
      }
    },
  );
  it('rejects changes to a foreign contact even when moved to an assigned client', async () => {
    svc.getClientId.mockResolvedValue('foreign');
    await expect(
      controller.update('contact', { clientId: 'assigned' }, user),
    ).rejects.toThrow(ForbiddenException);
    expect(svc.update).not.toHaveBeenCalled();
  });
  it('rejects moving an assigned contact to a foreign client', async () => {
    await expect(
      controller.update('contact', { clientId: 'foreign' }, user),
    ).rejects.toThrow(ForbiddenException);
    expect(svc.update).not.toHaveBeenCalled();
  });
  it('updates an assigned contact without changing its company', async () => {
    await controller.update('contact', { name: 'Updated' }, user);
    expect(access.assertCcoClientAllowed).toHaveBeenCalledWith(
      user,
      'assigned',
    );
    expect(svc.update).toHaveBeenCalledWith(
      'contact',
      { name: 'Updated' },
      user.userId,
    );
  });
  it.each(['assigned', 'foreign'])(
    'checks deletion ownership: %s',
    async (clientId) => {
      svc.getClientId.mockResolvedValue(clientId);
      if (clientId === 'assigned') {
        await controller.remove('contact', user);
        expect(svc.remove).toHaveBeenCalledWith('contact');
      } else {
        await expect(controller.remove('contact', user)).rejects.toThrow(
          ForbiddenException,
        );
        expect(svc.remove).not.toHaveBeenCalled();
      }
    },
  );
  it.each(['ADMIN', 'CEO'])(
    'retains %s cross-client access',
    async (roleCode) => {
      await controller.list('foreign', { ...user, roleCode });
      expect(svc.listForClient).toHaveBeenCalledWith('foreign');
    },
  );

  describe.each([
    'triggerPayroll',
    'triggerMcd',
    'updateTemplate',
    'resetTemplate',
  ] as const)('%s global communication option', (method) => {
    it.each(['CCO', 'CEO', 'CRM', 'CLIENT', 'ADMIN'])(
      'checks %s through the real role guard without sending mail',
      (roleCode) => {
        const context = {
          getHandler: () => ClientContactsController.prototype[method],
          getClass: () => ClientContactsController,
          switchToHttp: () => ({ getRequest: () => ({ user: { roleCode } }) }),
        } as unknown as ExecutionContext;
        const guard = new RolesGuard(new Reflector());
        if (roleCode === 'ADMIN') expect(guard.canActivate(context)).toBe(true);
        else
          expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      },
    );
  });
});
