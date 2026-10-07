import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
describe('Admin seed preserves unchanged credentials', () => {
  async function setup(
    isActive = true,
    configured = 'Synthetic@seed-password',
  ) {
    const passwordHash = await bcrypt.hash('Synthetic@seed-password', 4);
    const update = jest.fn();
    const context = {
      config: { get: () => configured },
      rolesRepo: { findOne: async () => ({ id: 'admin-role' }) },
      usersRepo: {
        findOne: async () => ({
          id: 'admin',
          passwordHash,
          isActive,
          deletedAt: null,
        }),
        update,
      },
    };
    await UsersService.prototype.seedAdminIfMissing.call(context as any);
    return update;
  }
  it('does not change the password hash or sessions on a routine restart', async () => {
    expect(await setup()).not.toHaveBeenCalled();
  });
  it('reactivates the account without rewriting an unchanged hash', async () => {
    expect(await setup(false)).toHaveBeenCalledWith(
      { id: 'admin' },
      { isActive: true, deletedAt: null },
    );
  });
  it('still rotates credentials when the configured recovery password changes', async () => {
    const update = await setup(true, 'Synthetic@rotated-password');
    expect(update).toHaveBeenCalledTimes(1);
    expect(
      await bcrypt.compare(
        'Synthetic@rotated-password',
        update.mock.calls[0][1].passwordHash,
      ),
    ).toBe(true);
  });
});
