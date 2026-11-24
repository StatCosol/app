import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FilesService } from './files.service';

describe('protected audit correction downloads', () => {
  const owner = {
    clientId: 'client-a',
    branchId: 'branch-a',
    auditorId: 'auditor-a',
    contractorId: 'vendor-a',
    requestedToUserId: 'vendor-a',
  };
  const user = (roleCode: string, id: string, extras = {}) =>
    ({
      roleCode,
      id,
      userId: id,
      clientId: 'client-a',
      ...extras,
    }) as any;
  function build(row: any = owner, branchAllowed = true, crmAllowed = true) {
    const branchQuery = jest
      .fn()
      .mockResolvedValue(branchAllowed ? [{ id: 'branch-a' }] : []);
    const query = jest.fn().mockResolvedValue(row ? [row] : []);
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      manager: { query, connection: { query: branchQuery } },
    } as any;
    const scope = {
      assertClientAllowed: jest.fn(async () => {
        if (!crmAllowed) throw new ForbiddenException();
      }),
      getScope: jest
        .fn()
        .mockResolvedValue({ level: 'clients', clientIds: ['client-a'] }),
    };
    const service = new FilesService(
      repo,
      repo,
      repo,
      repo,
      repo,
      scope as any,
    );
    return { service, query, branchQuery, scope, repo };
  }

  it.each([
    'audit-nc/correction.pdf',
    'uploads/audit-nc/correction.pdf',
    '/uploads/audit-nc/correction.pdf',
  ])('allows the assigned auditor for %s', async (file) => {
    const { service, query } = build();
    await expect(
      service.assertCanDownload(user('AUDITOR', 'auditor-a'), file),
    ).resolves.toBeUndefined();
    expect(query.mock.calls[0][0]).toContain('nc.audit_id = rs.audit_id');
    expect(query.mock.calls[0][1][0]).toContain('audit-nc/correction.pdf');
  });
  it('refuses another auditor even in the same client', async () => {
    const { service } = build();
    await expect(
      service.assertCanDownload(
        user('AUDITOR', 'auditor-b'),
        'audit-nc/correction.pdf',
      ),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the assigned contractor who received the correction', async () => {
    const { service } = build();
    await expect(
      service.assertCanDownload(
        user('CONTRACTOR', 'vendor-a'),
        'audit-nc/correction.pdf',
      ),
    ).resolves.toBeUndefined();
  });
  it.each([{ contractorId: 'vendor-b' }, { requestedToUserId: 'vendor-b' }])(
    'refuses a contractor outside the audit or NC assignment: %o',
    async (overrides) => {
      const { service } = build({ ...owner, ...overrides });
      await expect(
        service.assertCanDownload(
          user('CONTRACTOR', 'vendor-a'),
          'audit-nc/correction.pdf',
        ),
      ).rejects.toThrow(ForbiddenException);
    },
  );
  it.each(['MASTER', 'BRANCH'])(
    'checks the current branch mapping for CLIENT %s',
    async (userType) => {
      const { service, branchQuery } = build();
      await expect(
        service.assertCanDownload(
          user('CLIENT', 'client-user', { userType }),
          'audit-nc/correction.pdf',
        ),
      ).resolves.toBeUndefined();
      expect(branchQuery.mock.calls[0][1]).toEqual([
        'branch-a',
        'client-a',
        userType === 'MASTER',
        'client-user',
      ]);
    },
  );
  it('rejects a client from another company', async () => {
    const { service } = build();
    await expect(
      service.assertCanDownload(
        user('CLIENT', 'client-user', {
          clientId: 'client-b',
          userType: 'MASTER',
        }),
        'audit-nc/correction.pdf',
      ),
    ).rejects.toThrow(ForbiddenException);
  });
  it('rejects an unassigned branch user', async () => {
    const { service } = build(owner, false);
    await expect(
      service.assertCanDownload(
        user('CLIENT', 'branch-user'),
        'audit-nc/correction.pdf',
      ),
    ).rejects.toThrow(ForbiddenException);
  });
  it('rejects a branch user when a legacy audit has no branch', async () => {
    const { service } = build({ ...owner, branchId: null });
    await expect(
      service.assertCanDownload(
        user('CLIENT', 'branch-user'),
        'audit-nc/correction.pdf',
      ),
    ).rejects.toThrow(ForbiddenException);
  });
  it('checks CRM assignment', async () => {
    const { service, scope } = build();
    const crm = user('CRM', 'crm-a');
    await expect(
      service.assertCanDownload(crm, 'audit-nc/correction.pdf'),
    ).resolves.toBeUndefined();
    expect(scope.assertClientAllowed).toHaveBeenCalledWith(crm, 'client-a');
    const unassigned = build(owner, true, false);
    await expect(
      unassigned.service.assertCanDownload(crm, 'audit-nc/correction.pdf'),
    ).rejects.toThrow(ForbiddenException);
  });
  it.each(['PAYROLL', 'PF_TEAM', 'EMPLOYEE'])(
    'does not grant unrelated %s access',
    async (role) => {
      const { service } = build();
      await expect(
        service.assertCanDownload(
          user(role, 'vendor-a'),
          'audit-nc/correction.pdf',
        ),
      ).rejects.toThrow(ForbiddenException);
    },
  );
  it('allows admin only for a registered correction', async () => {
    await expect(
      build().service.assertCanDownload(
        user('ADMIN', 'admin'),
        'audit-nc/correction.pdf',
      ),
    ).resolves.toBeUndefined();
    await expect(
      build(null).service.assertCanDownload(
        user('ADMIN', 'admin'),
        'audit-nc/missing.pdf',
      ),
    ).rejects.toThrow(BadRequestException);
  });
  it('fails closed on lookup errors', async () => {
    const { service, query, repo } = build();
    query.mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.assertCanDownload(
        user('AUDITOR', 'auditor-a'),
        'audit-nc/correction.pdf',
      ),
    ).rejects.toThrow('database unavailable');
    expect(repo.findOne).not.toHaveBeenCalled();
  });
});
