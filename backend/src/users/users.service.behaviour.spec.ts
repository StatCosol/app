import * as bcrypt from 'bcryptjs';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * Behaviour tests for UsersService: account creation rules, role limits,
 * status/edit/delete guard rails, login validation and the deletion-request
 * approval workflow. Repositories are in-memory fakes so each rule is checked
 * against the data the service actually reads.
 */

type Row = Record<string, any>;

const ROLES: Row[] = [
  'ADMIN',
  'CEO',
  'CCO',
  'CRM',
  'AUDITOR',
  'CLIENT',
  'CONTRACTOR',
  'EMPLOYEE',
  'TIME_OFFICE_EXECUTIVE',
].map((code) => ({ id: `role-${code}`, code, name: code }));

/** Matches the subset of TypeORM `where` objects the service uses. */
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected && typeof expected === 'object' && '_type' in expected) {
      const op = expected as { _type: string; _value: any };
      if (op._type === 'isNull') return actual == null;
      if (op._type === 'in') return op._value.includes(actual);
      if (op._type === 'not') {
        const inner = op._value;
        if (inner?._type === 'like') {
          const re = new RegExp(
            '^' + String(inner._value).replace(/%/g, '.*') + '$',
          );
          return !re.test(String(actual ?? ''));
        }
        return actual !== inner;
      }
      return true;
    }
    return actual === expected;
  });
}

function repo(rows: Row[]) {
  const whereList = (opts: any) =>
    Array.isArray(opts?.where) ? opts.where : [opts?.where ?? {}];
  const r = {
    rows,
    findOne: jest.fn(
      async (opts: any) =>
        rows.find((row) => whereList(opts).some((w: Row) => matches(row, w))) ??
        null,
    ),
    find: jest.fn(async (opts: any) =>
      rows.filter((row) => whereList(opts).some((w: Row) => matches(row, w))),
    ),
    count: jest.fn(
      async (opts: any = {}) =>
        rows.filter((row) => whereList(opts).some((w: Row) => matches(row, w)))
          .length,
    ),
    create: jest.fn((v: Row) => ({ ...v })),
    save: jest.fn(async (v: any) => {
      const list = Array.isArray(v) ? v : [v];
      for (const item of list) {
        if (!item.id) item.id = `id-${rows.length + 1}`;
        const idx = rows.findIndex((row) => row.id === item.id);
        if (idx >= 0) rows[idx] = { ...rows[idx], ...item };
        else rows.push(item);
      }
      return v;
    }),
    update: jest.fn(async (where: Row, patch: Row) => {
      rows
        .filter((row) => matches(row, where))
        .forEach((row) => {
          Object.assign(row, patch);
        });
    }),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        relation: () => qb,
        of: () => qb,
        add: jest.fn(async () => undefined),
        select: () => qb,
        where: () => qb,
        andWhere: () => qb,
        addSelect: () => qb,
        getRawMany: async () => rows.map((row) => ({ userCode: row.userCode })),
        getOne: async () => null,
      };
      return qb;
    }),
    manager: { query: jest.fn(async () => []) },
  };
  return r;
}

function build(
  seed: { users?: Row[]; clients?: Row[]; branches?: Row[] } = {},
) {
  const rolesRepo = repo(ROLES.map((r) => ({ ...r })));
  const usersRepo = repo(seed.users ?? []);
  const deletionRepo = repo([]);
  const clientsRepo = repo(seed.clients ?? []);
  const branchesRepo = repo(seed.branches ?? []);
  const dataSource = { query: jest.fn(async (): Promise<any[]> => []) };
  const auditLogs = { log: jest.fn(async () => undefined) };
  const config = { get: jest.fn(() => undefined) };
  const clientsService = { softDelete: jest.fn(async () => undefined) };
  const service = new UsersService(
    rolesRepo as any,
    usersRepo as any,
    deletionRepo as any,
    clientsRepo as any,
    branchesRepo as any,
    dataSource as any,
    auditLogs as any,
    config as any,
    clientsService as any,
  );
  return {
    service,
    rolesRepo,
    usersRepo,
    deletionRepo,
    clientsRepo,
    branchesRepo,
    dataSource,
    auditLogs,
    config,
    clientsService,
  };
}

const user = (code: string, extra: Row = {}): Row => ({
  id: `${code.toLowerCase()}-1`,
  roleId: `role-${code}`,
  role: code,
  name: `${code} User`,
  email: `${code.toLowerCase()}@example.test`,
  isActive: true,
  deletedAt: null,
  clientId: null,
  ...extra,
});

const activeClient = {
  id: 'client-1',
  clientName: 'Vedha Entech India Pvt Ltd',
  isActive: true,
  isDeleted: false,
  deletedAt: null,
};

describe('UsersService account rules', () => {
  describe('createUser', () => {
    it('rejects an unknown role id', async () => {
      const { service } = build();
      await expect(
        service.createUser({
          roleId: 'nope',
          name: 'A',
          email: 'a@example.test',
        } as any),
      ).rejects.toThrow('Invalid roleId');
    });

    it('refuses to create client master users outside client registration', async () => {
      const { service } = build({ clients: [activeClient] });
      await expect(
        service.createUser({
          roleId: 'role-CLIENT',
          name: 'Client Master',
          email: 'cm@example.test',
          clientId: 'client-1',
        } as any),
      ).rejects.toThrow(/Client Registration/);
    });

    it('allows only one active CEO', async () => {
      const { service } = build({ users: [user('CEO')] });
      await expect(
        service.createUser({
          roleId: 'role-CEO',
          name: 'Second CEO',
          email: 'ceo2@example.test',
        } as any),
      ).rejects.toThrow('Only one CEO user is allowed.');
    });

    it('does not count a deleted CEO against the single-CEO limit', async () => {
      const { service } = build({
        users: [
          user('CEO', {
            isActive: false,
            email: 'ceo@example.test#deleted#1',
          }),
        ],
      });
      await expect(
        service.createUser({
          roleId: 'role-CEO',
          name: 'New CEO',
          email: 'new-ceo@example.test',
          password: 'Synthetic@pass1',
        } as any),
      ).resolves.toMatchObject({ message: 'User created' });
    });

    it('caps CCO users at five', async () => {
      const ccos = Array.from({ length: 5 }, (_, i) =>
        user('CCO', { id: `cco-${i}`, email: `cco${i}@example.test` }),
      );
      const { service } = build({ users: ccos });
      await expect(
        service.createUser({
          roleId: 'role-CCO',
          name: 'Sixth CCO',
          email: 'cco6@example.test',
        } as any),
      ).rejects.toThrow('Only five CCO users are allowed.');
    });

    // KNOWN BUG: the CCO limit counts deleted and inactive CCOs, unlike the CEO
    // limit. After five CCOs have ever existed, no replacement can be created.
    // Remove `.failing` once enforceLimits filters CCOs like it filters CEOs.
    it.failing(
      'does not count deleted CCOs against the five-CCO cap',
      async () => {
        const ccos = Array.from({ length: 5 }, (_, i) =>
          user('CCO', {
            id: `cco-${i}`,
            isActive: false,
            deletedAt: new Date(),
            email: `cco${i}@example.test#deleted#1`,
          }),
        );
        const { service } = build({ users: ccos });
        await expect(
          service.createUser({
            roleId: 'role-CCO',
            name: 'Replacement CCO',
            email: 'cco-new@example.test',
            password: 'Synthetic@pass1',
          } as any),
        ).resolves.toMatchObject({ message: 'User created' });
      },
    );

    it.each(['CONTRACTOR', 'TIME_OFFICE_EXECUTIVE'])(
      'requires an active company for %s logins',
      async (code) => {
        const { service } = build({
          clients: [{ ...activeClient, isActive: false }],
        });
        await expect(
          service.createUser({
            roleId: `role-${code}`,
            name: 'Scoped',
            email: 's@example.test',
          } as any),
        ).rejects.toThrow('clientId is required for this role');
        await expect(
          service.createUser({
            roleId: `role-${code}`,
            name: 'Scoped',
            email: 's@example.test',
            clientId: 'client-1',
          } as any),
        ).rejects.toThrow('Client not found or inactive');
      },
    );

    it('requires CRM users to report to an active CCO', async () => {
      const { service } = build({
        users: [
          user('CCO', { isActive: false }),
          user('AUDITOR', { id: 'aud-1' }),
        ],
      });
      const crm = (ownerCcoId?: string) =>
        service.createUser({
          roleId: 'role-CRM',
          name: 'New CRM',
          email: 'crm@example.test',
          ownerCcoId,
        } as any);
      await expect(crm()).rejects.toThrow('ownerCcoId is required');
      await expect(crm('missing')).rejects.toThrow('Owner CCO user not found');
      await expect(crm('aud-1')).rejects.toThrow('must refer to a CCO user');
      await expect(crm('cco-1')).rejects.toThrow('must be active');
    });

    it('rejects an email that already belongs to a live account', async () => {
      const { service } = build({
        users: [user('AUDITOR', { email: 'taken@example.test' })],
      });
      await expect(
        service.createUser({
          roleId: 'role-AUDITOR',
          name: 'Dup',
          email: '  Taken@Example.test ',
        } as any),
      ).rejects.toThrow('Email already exists');
    });

    it('generates a strong password, a readable user code and an audit row', async () => {
      const { service, usersRepo, auditLogs } = build({
        clients: [activeClient],
        users: [user('CONTRACTOR', { id: 'old', userCode: 'VGCOVEI01' })],
      });
      const result = await service.createUser({
        roleId: 'role-CONTRACTOR',
        name: 'Venu Gopal',
        email: 'Venu@Example.test',
        clientId: 'client-1',
      } as any);
      expect(result.generatedPassword).toEqual(expect.any(String));
      expect(result.generatedPassword!.length).toBeGreaterThanOrEqual(12);
      const saved = usersRepo.rows.find((r) => r.id === result.id)!;
      expect(saved.email).toBe('venu@example.test');
      // initials + role prefix + company abbreviation (suffixes dropped) + next seq
      expect(saved.userCode).toBe('VGCOVEI02');
      expect(
        await bcrypt.compare(result.generatedPassword!, saved.passwordHash),
      ).toBe(true);
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'USER', action: 'CREATE' }),
      );
    });

    it('never returns a password the admin typed in', async () => {
      const { service } = build();
      const result = await service.createUser({
        roleId: 'role-AUDITOR',
        name: 'Raj Patel',
        email: 'raj@example.test',
        password: 'Synthetic@typed1',
      } as any);
      expect(result).not.toHaveProperty('generatedPassword');
    });

    it('requires branch users to have branches that belong to the company', async () => {
      const { service } = build({ clients: [activeClient] });
      await expect(
        service.createUser({
          roleId: 'role-CLIENT',
          userType: 'BRANCH',
          name: 'Branch',
          email: 'b@example.test',
          clientId: 'client-1',
          branchIds: [],
        } as any),
      ).rejects.toThrow('at least one branch');
    });

    // KNOWN BUG: branch ownership is checked after the user row is saved and
    // nothing is wrapped in a transaction, so a rejected request still leaves
    // a live login behind with no branches. Remove `.failing` once fixed.
    it.failing(
      'does not leave a user behind when a branch is invalid',
      async () => {
        const { service, usersRepo } = build({ clients: [activeClient] });
        await expect(
          service.createUser({
            roleId: 'role-CLIENT',
            userType: 'BRANCH',
            name: 'Branch',
            email: 'b@example.test',
            clientId: 'client-1',
            branchIds: ['other-company-branch'],
          } as any),
        ).rejects.toThrow('invalid or not linked');
        expect(usersRepo.rows).toHaveLength(0);
      },
    );
  });

  describe('status, edit and delete guard rails', () => {
    it('never toggles ADMIN or CEO status and blocks self-deactivation', async () => {
      const { service } = build({
        users: [user('ADMIN'), user('CEO'), user('AUDITOR')],
      });
      await expect(service.updateUserStatus('admin-1', false)).rejects.toThrow(
        'cannot be activated/deactivated',
      );
      await expect(service.updateUserStatus('ceo-1', false)).rejects.toThrow(
        'cannot be activated/deactivated',
      );
      await expect(
        service.updateUserStatus('auditor-1', false, 'auditor-1'),
      ).rejects.toThrow('your own status');
    });

    it('blocks deactivating a CRM who still has client assignments', async () => {
      const { service, dataSource, usersRepo } = build({
        users: [user('CRM')],
      });
      dataSource.query.mockResolvedValueOnce([{ cnt: '2' }]);
      await expect(
        service.updateUserStatus('crm-1', false, 'admin-1'),
      ).rejects.toThrow('2 active client assignment');
      expect(usersRepo.rows[0].isActive).toBe(true);
    });

    it('deactivates an unassigned auditor and records before/after', async () => {
      const { service, dataSource, usersRepo, auditLogs } = build({
        users: [user('AUDITOR')],
      });
      dataSource.query.mockResolvedValueOnce([{ cnt: '0' }]);
      await service.updateUserStatus('auditor-1', false, 'admin-1');
      expect(usersRepo.rows[0].isActive).toBe(false);
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_CHANGE',
          beforeJson: { isActive: true },
        }),
      );
    });

    it('only lets ADMIN/CEO accounts edit themselves', async () => {
      const { service } = build({ users: [user('CEO')] });
      await expect(
        service.updateUser('ceo-1', { name: 'X' }, 'admin-1'),
      ).rejects.toThrow('can only be edited by themselves');
    });

    // KNOWN BUG: updateUser mutates the entity before building the audit row,
    // so beforeJson always equals afterJson and the old values are lost.
    it.failing(
      'records the previous values in the edit audit row',
      async () => {
        const { service, auditLogs } = build({
          users: [user('AUDITOR', { name: 'Old Name' })],
        });
        await service.updateUser('auditor-1', { name: 'New Name' }, 'admin-1');
        expect(auditLogs.log).toHaveBeenCalledWith(
          expect.objectContaining({
            beforeJson: expect.objectContaining({ name: 'Old Name' }),
          }),
        );
      },
    );

    // KNOWN BUG: changing a user's email does not check for an existing
    // account with that email (createUser does).
    it.failing('rejects an edit to an email already in use', async () => {
      const { service } = build({
        users: [user('AUDITOR'), user('CRM', { email: 'crm@example.test' })],
      });
      await expect(
        service.updateUser('auditor-1', { email: 'CRM@example.test' }, 'a'),
      ).rejects.toThrow(BadRequestException);
    });

    it('never deletes ADMIN, CEO or your own account', async () => {
      const { service } = build({
        users: [user('ADMIN'), user('CEO'), user('AUDITOR')],
      });
      await expect(service.deleteUser('admin-1')).rejects.toThrow(
        'Admin users cannot be deleted',
      );
      await expect(service.deleteUser('ceo-1')).rejects.toThrow(
        'CEO users cannot be deleted',
      );
      await expect(
        service.deleteUser('auditor-1', 'auditor-1'),
      ).rejects.toThrow('your own account');
    });

    it('soft-deletes by freeing the email and unlinking branches', async () => {
      const { service, usersRepo, dataSource } = build({
        users: [user('CLIENT', { mobile: '999' })],
      });
      await service.deleteUser('client-1', 'admin-1');
      const row = usersRepo.rows[0];
      expect(row.isActive).toBe(false);
      expect(row.deletedAt).toBeInstanceOf(Date);
      expect(row.email).toMatch(/^client@example\.test#deleted#\d+$/);
      expect(row.mobile).toBeNull();
      expect(dataSource.query).toHaveBeenCalledWith(
        'DELETE FROM user_branches WHERE user_id = $1',
        ['client-1'],
      );
    });
  });

  describe('admin portal edit (PATCH /users/:id)', () => {
    it('rejects an unknown role and Time Office roles without an active company', async () => {
      const { service } = build({ users: [user('AUDITOR')] });
      await expect(
        service.updateUserFromPortal('auditor-1', { role: 'wizard' }, 'a'),
      ).rejects.toThrow('Invalid role');
      await expect(
        service.updateUserFromPortal(
          'auditor-1',
          { role: 'time_office_executive' },
          'a',
        ),
      ).rejects.toThrow('active company assignment');
    });

    it('records the real before/after values', async () => {
      const { service, auditLogs } = build({ users: [user('AUDITOR')] });
      await service.updateUserFromPortal(
        'auditor-1',
        { fullName: ' Renamed ', mobile: '' },
        'admin-1',
      );
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          beforeJson: expect.objectContaining({ name: 'AUDITOR User' }),
          afterJson: expect.objectContaining({ name: 'Renamed', mobile: null }),
        }),
      );
    });

    // KNOWN BUG: the portal edit changes role without enforceLimits, so an
    // admin can promote a second user to CEO (createUser forbids that).
    it.failing('does not allow a second CEO via a role change', async () => {
      const { service } = build({ users: [user('CEO'), user('AUDITOR')] });
      await expect(
        service.updateUserFromPortal('auditor-1', { role: 'CEO' }, 'admin-1'),
      ).rejects.toThrow('Only one CEO user is allowed.');
    });

    // KNOWN BUG: isActive=false through the portal skips the checks that
    // PATCH /admin/users/:id/status applies (CRM with live assignments).
    it.failing(
      'does not deactivate a CRM who still has assignments',
      async () => {
        const { service, dataSource } = build({ users: [user('CRM')] });
        dataSource.query.mockResolvedValue([{ cnt: '3' }]);
        await expect(
          service.updateUserFromPortal('crm-1', { isActive: false }, 'admin-1'),
        ).rejects.toThrow(/active client assignment/);
      },
    );
  });

  describe('login and password', () => {
    async function withPassword(extra: Row = {}) {
      const ctx = build();
      const passwordHash = await bcrypt.hash('Synthetic@pass1', 4);
      const found = user('AUDITOR', { passwordHash, ...extra });
      jest.spyOn(ctx.service, 'findByEmail').mockResolvedValue(found as any);
      ctx.usersRepo.rows.push(found);
      return ctx;
    }

    it('requires both email and password', async () => {
      const { service } = build();
      await expect(service.validateLogin('', 'x')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.validateLogin('a@b.c', '')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects unknown emails and wrong passwords with the same message', async () => {
      const unknown = build();
      jest.spyOn(unknown.service, 'findByEmail').mockResolvedValue(null);
      await expect(
        unknown.service.validateLogin('nobody@example.test', 'x'),
      ).rejects.toThrow('Invalid credentials');
      const { service } = await withPassword();
      await expect(
        service.validateLogin('auditor@example.test', 'wrong'),
      ).rejects.toThrow('Invalid credentials');
    });

    it('rejects inactive users', async () => {
      const { service } = await withPassword({ isActive: false });
      await expect(
        service.validateLogin('auditor@example.test', 'Synthetic@pass1'),
      ).rejects.toThrow('User is inactive');
    });

    it('returns the role code and company for a valid login', async () => {
      const { service } = await withPassword({ clientId: 'client-1' });
      await expect(
        service.validateLogin('auditor@example.test', 'Synthetic@pass1'),
      ).resolves.toMatchObject({
        userId: 'auditor-1',
        roleCode: 'AUDITOR',
        clientId: 'client-1',
      });
    });

    it('changes the password only after the current one is verified', async () => {
      const { service, usersRepo } = await withPassword();
      await expect(
        service.changeMyPassword('auditor-1', 'wrong', 'Synthetic@pass2'),
      ).rejects.toThrow('Current password is incorrect');
      await expect(
        service.changeMyPassword('auditor-1', 'Synthetic@pass1', '123'),
      ).rejects.toThrow('at least 6 characters');
      await service.changeMyPassword(
        'auditor-1',
        'Synthetic@pass1',
        'Synthetic@pass2',
      );
      expect(
        await bcrypt.compare('Synthetic@pass2', usersRepo.rows[0].passwordHash),
      ).toBe(true);
    });

    it('admin reset never touches ADMIN or CEO accounts', async () => {
      const { service } = build({ users: [user('ADMIN'), user('CEO')] });
      await expect(service.adminResetPassword('admin-1')).rejects.toThrow(
        'Cannot reset ADMIN or CEO password',
      );
      await expect(service.adminResetPassword('ceo-1')).rejects.toThrow(
        'Cannot reset ADMIN or CEO password',
      );
    });

    it('admin reset issues a new password and audits it', async () => {
      const { service, usersRepo, auditLogs } = build({
        users: [user('AUDITOR', { passwordHash: 'old' })],
      });
      const res = await service.adminResetPassword('auditor-1', 'admin-1');
      expect(
        await bcrypt.compare(res.newPassword, usersRepo.rows[0].passwordHash),
      ).toBe(true);
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PASSWORD_RESET' }),
      );
    });

    it('resetCeoPassword only matches an active CEO', async () => {
      const { service, usersRepo } = build({
        users: [user('CEO'), user('AUDITOR', { email: 'x@example.test' })],
      });
      await expect(
        service.resetCeoPassword({
          email: 'x@example.test',
          newPassword: 'Synthetic@pass9',
        }),
      ).rejects.toThrow(NotFoundException);
      await service.resetCeoPassword({
        email: 'CEO@example.test',
        newPassword: 'Synthetic@pass9',
      });
      expect(
        await bcrypt.compare('Synthetic@pass9', usersRepo.rows[0].passwordHash),
      ).toBe(true);
    });
  });

  describe('seeding', () => {
    it('creates the system roles only on an empty table', async () => {
      const ctx = build();
      await ctx.service.seedRolesIfEmpty();
      expect(ctx.rolesRepo.save).not.toHaveBeenCalled();

      ctx.rolesRepo.rows.length = 0;
      await ctx.service.seedRolesIfEmpty();
      const codes = ctx.rolesRepo.rows.map((r) => r.code);
      expect(codes).toEqual(
        expect.arrayContaining([
          'ADMIN',
          'CEO',
          'CCO',
          'CRM',
          'AUDITOR',
          'CLIENT',
          'CONTRACTOR',
          'EMPLOYEE',
          'PAYROLL',
          'PF_TEAM',
          'TIME_OFFICE_EXECUTIVE',
          'TIME_OFFICE_MANAGER',
        ]),
      );
    });

    it('never creates a default admin in production without a configured password', async () => {
      const ctx = build();
      ctx.config.get.mockImplementation(((key: string) =>
        key === 'NODE_ENV' ? 'production' : undefined) as any);
      await ctx.service.seedAdminIfMissing();
      expect(ctx.usersRepo.save).not.toHaveBeenCalled();
    });

    it('creates the admin with the configured password', async () => {
      const ctx = build();
      ctx.config.get.mockImplementation(((key: string) =>
        key === 'DEFAULT_SEED_PASSWORD'
          ? 'Synthetic@seed1'
          : undefined) as any);
      await ctx.service.seedAdminIfMissing();
      const admin = ctx.usersRepo.rows[0];
      expect(admin).toMatchObject({
        email: 'it_admin@statcosol.com',
        roleId: 'role-ADMIN',
        isActive: true,
      });
      expect(await bcrypt.compare('Synthetic@seed1', admin.passwordHash)).toBe(
        true,
      );
    });

    it('skips seeding when bootstrap seeding is disabled', async () => {
      const ctx = build();
      ctx.config.get.mockImplementation(((key: string) =>
        key === 'SKIP_BOOTSTRAP_SEED' ? 'true' : undefined) as any);
      await ctx.service.onModuleInit();
      expect(ctx.usersRepo.manager.query).not.toHaveBeenCalled();
    });
  });

  describe('deletion requests', () => {
    it('routes CRM deletions to the owning CCO, CCO deletions to the CEO queue', async () => {
      const { service, deletionRepo } = build({
        users: [user('CRM', { ownerCcoId: 'cco-9' }), user('CCO')],
      });
      await service.createUserDeletionRequest('crm-1', 'admin-1');
      await service.createUserDeletionRequest('cco-1', 'admin-1');
      expect(deletionRepo.rows).toEqual([
        expect.objectContaining({
          entityId: 'crm-1',
          requiredApproverRole: 'CCO',
          requiredApproverUserId: 'cco-9',
          status: 'PENDING',
        }),
        expect.objectContaining({
          entityId: 'cco-1',
          requiredApproverRole: 'CEO',
          requiredApproverUserId: null,
        }),
      ]);
    });

    it('refuses CEO deletion requests and duplicate pending requests', async () => {
      const { service } = build({ users: [user('CEO'), user('AUDITOR')] });
      await expect(
        service.createUserDeletionRequest('ceo-1', 'admin-1'),
      ).rejects.toThrow('CEO user cannot be deleted');
      await service.createUserDeletionRequest('auditor-1', 'admin-1');
      await expect(
        service.createUserDeletionRequest('auditor-1', 'admin-1'),
      ).rejects.toThrow('Action already in process');
    });

    it('only the named approver can approve a user-specific request', async () => {
      const { service, deletionRepo, usersRepo } = build({
        users: [user('CRM', { ownerCcoId: 'cco-9' })],
      });
      deletionRepo.rows.push({
        id: 7,
        entityType: 'USER',
        entityId: 'crm-1',
        requiredApproverRole: 'CCO',
        requiredApproverUserId: 'cco-9',
        status: 'PENDING',
      });
      await expect(
        service.approveDeletionRequest('7', 'cco-other', 'CCO'),
      ).rejects.toThrow('Not your approval request');
      await expect(
        service.approveDeletionRequest('abc', 'cco-9', 'CCO'),
      ).rejects.toThrow('Invalid request ID');
      await service.approveDeletionRequest('7', 'cco-9', 'CCO');
      expect(deletionRepo.rows[0].status).toBe('APPROVED');
      expect(usersRepo.rows[0].deletedAt).toBeInstanceOf(Date);
      await expect(
        service.approveDeletionRequest('7', 'cco-9', 'CCO'),
      ).rejects.toThrow('Invalid request');
    });

    it('a role-queue CCO can only act on requests in their own portfolio', async () => {
      const { service, deletionRepo, dataSource } = build({
        users: [user('AUDITOR')],
      });
      deletionRepo.rows.push({
        id: 8,
        entityType: 'USER',
        entityId: 'auditor-1',
        requiredApproverRole: 'CCO',
        requiredApproverUserId: null,
        status: 'PENDING',
      });
      await expect(
        service.approveDeletionRequest('8', 'cco-1', 'CEO'),
      ).rejects.toThrow('Not allowed');
      dataSource.query.mockResolvedValueOnce([]);
      await expect(
        service.rejectDeletionRequest('8', 'cco-1', 'CCO', 'no'),
      ).rejects.toThrow('Not your approval request');
      dataSource.query.mockResolvedValueOnce([{ '?column?': 1 }]);
      await service.rejectDeletionRequest('8', 'cco-1', 'CCO', 'keep');
      expect(deletionRepo.rows[0]).toMatchObject({
        status: 'REJECTED',
        remarks: 'keep',
      });
    });

    it('client deletions run the full client cascade', async () => {
      const { service, deletionRepo, clientsService } = build();
      deletionRepo.rows.push({
        id: 9,
        entityType: 'CLIENT',
        entityId: 'client-1',
        requiredApproverRole: 'CEO',
        requiredApproverUserId: null,
        status: 'PENDING',
        remarks: 'closing',
      });
      await service.approveDeletionRequest('9', 'ceo-1', 'CEO');
      expect(clientsService.softDelete).toHaveBeenCalledWith(
        'client-1',
        'ceo-1',
        'CEO',
        'closing',
      );
    });
  });

  describe('getMe service package', () => {
    function me(roleCode: string, packageRows: Row[], moduleRows: Row[]) {
      const ctx = build({
        users: [
          user(roleCode, {
            clientId: 'client-1',
            client: { clientName: 'Acme', logoUrl: '/logo.png' },
          }),
        ],
      });
      ctx.dataSource.query.mockImplementation((async (sql: string) => {
        if (sql.includes('user_branches')) return [];
        if (sql.includes('client_service_packages')) return packageRows;
        if (sql.includes('client_module_entitlements')) return moduleRows;
        return [];
      }) as any);
      return ctx.service.getMe(`${roleCode.toLowerCase()}-1`);
    }

    it('gives no modules to a company whose package is not yet approved', async () => {
      const res = await me(
        'CLIENT',
        [{ package_code: 'SOMETHING', approved_at: null }],
        [{ module_code: 'EMPLOYEE_ATTENDANCE' }],
      );
      expect(res.enabledModules).toEqual([]);
      expect(res).toMatchObject({
        isMasterUser: true,
        userType: 'MASTER',
        clientName: 'Acme',
      });
    });

    it('drops unknown module codes from explicit entitlements', async () => {
      const res = await me(
        'TIME_OFFICE_EXECUTIVE',
        [{ package_code: 'X', approved_at: new Date() }],
        [
          { module_code: 'EMPLOYEE_ATTENDANCE' },
          { module_code: 'NOT_A_MODULE' },
        ],
      );
      expect(res.enabledModules).toEqual(['EMPLOYEE_ATTENDANCE']);
    });

    it('internal staff get no company package', async () => {
      const ctx = build({ users: [user('CRM', { clientId: 'client-1' })] });
      const res = await ctx.service.getMe('crm-1');
      expect(res.servicePackage).toBeNull();
      expect(res.enabledModules).toEqual([]);
    });
  });
});
