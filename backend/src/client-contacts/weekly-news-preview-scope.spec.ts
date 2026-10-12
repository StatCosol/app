import { ForbiddenException } from '@nestjs/common';
import { ClientContactsController } from './client-contacts.controller';
import type { ReqUser } from '../access/access-scope.service';

describe('weekly recipient preview scope', () => {
  function setup() {
    const assertCcoClientAllowed = jest.fn().mockResolvedValue(undefined);
    const weeklyNewsRecipients = jest.fn().mockResolvedValue([]);
    const controller = Object.assign(
      Object.create(ClientContactsController.prototype),
      { access: { assertCcoClientAllowed }, cron: { weeklyNewsRecipients } },
    ) as ClientContactsController;
    return { controller, assertCcoClientAllowed, weeklyNewsRecipients };
  }

  it('does not expose addresses when client scope is denied', async () => {
    const { controller, assertCcoClientAllowed, weeklyNewsRecipients } =
      setup();
    const user = { userId: 'cco', roleCode: 'CCO' } as ReqUser;
    assertCcoClientAllowed.mockRejectedValue(new ForbiddenException());
    await expect(
      controller.weeklyNewsRecipients('other-client', user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(assertCcoClientAllowed).toHaveBeenCalledWith(user, 'other-client');
    expect(weeklyNewsRecipients).not.toHaveBeenCalled();
  });

  it.each(['CCO', 'ADMIN', 'CEO'])(
    'checks scope before returning recipients for %s',
    async (roleCode) => {
      const { controller, assertCcoClientAllowed, weeklyNewsRecipients } =
        setup();
      const user = { userId: 'user', roleCode } as ReqUser;
      assertCcoClientAllowed.mockImplementation(async () => {
        expect(weeklyNewsRecipients).not.toHaveBeenCalled();
      });
      await expect(
        controller.weeklyNewsRecipients('client', user),
      ).resolves.toEqual([]);
      expect(assertCcoClientAllowed).toHaveBeenCalledWith(user, 'client');
      expect(weeklyNewsRecipients).toHaveBeenCalledWith('client');
    },
  );
});
