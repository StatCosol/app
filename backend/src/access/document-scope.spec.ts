import { ForbiddenException } from '@nestjs/common';
import { AccessScopeService } from './access-scope.service';

/**
 * One rule for "may this user have a document owned by (client, branch)".
 *
 * The question kept being answered separately and the copies disagreed. A
 * branch user's roleCode is CLIENT — only userType tells them apart — so any
 * check written as "does the document's client match mine?" admits them to
 * every branch in the company. That shipped twice: CRM unit documents and
 * safety documents, each with a correctly scoped branch endpoint sitting
 * beside a client endpoint that was not.
 */
describe('assertDocumentInScope', () => {
  function makeService(scope: any) {
    const svc = new AccessScopeService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(svc, 'getScope').mockResolvedValue(scope);
    return svc;
  }

  const user = { id: 'u1', userId: 'u1', roleCode: 'CLIENT' } as any;

  const branchScope = {
    level: 'branches',
    clientId: 'client-a',
    branchIds: ['branch-1'],
  };
  const masterScope = { level: 'client', clientId: 'client-a' };

  it('lets a master have any branch in their own client', async () => {
    const svc = makeService(masterScope);
    await expect(
      svc.assertDocumentInScope(user, {
        clientId: 'client-a',
        branchId: 'branch-9',
      }),
    ).resolves.toBeUndefined();
  });

  it("refuses another client's document", async () => {
    const svc = makeService(masterScope);
    await expect(
      svc.assertDocumentInScope(user, {
        clientId: 'client-b',
        branchId: null,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets a branch user have their own branch', async () => {
    const svc = makeService(branchScope);
    await expect(
      svc.assertDocumentInScope(user, {
        clientId: 'client-a',
        branchId: 'branch-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('refuses a branch user another branch in the same client', async () => {
    // The bug, stated: same company, different branch.
    const svc = makeService(branchScope);
    await expect(
      svc.assertDocumentInScope(user, {
        clientId: 'client-a',
        branchId: 'branch-9',
      }),
    ).rejects.toThrow(/Branch not in scope/);
  });

  it('lets a branch user have a company-scoped document', async () => {
    // A null branchId is company-wide, which the branch-scoped listings
    // already show them.
    const svc = makeService(branchScope);
    await expect(
      svc.assertDocumentInScope(user, {
        clientId: 'client-a',
        branchId: null,
      }),
    ).resolves.toBeUndefined();
  });

  it('refuses a branch user with no mappings', async () => {
    const svc = makeService({
      level: 'branches',
      clientId: 'client-a',
      branchIds: [],
    });
    await expect(
      svc.assertDocumentInScope(user, {
        clientId: 'client-a',
        branchId: 'branch-1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses a document with no owner at all', async () => {
    const svc = makeService(masterScope);
    await expect(
      svc.assertDocumentInScope(user, { clientId: null, branchId: null }),
    ).rejects.toThrow(/no owner/);
  });

  it('lets a global-scope user through', async () => {
    const svc = makeService({ level: 'all' });
    await expect(
      svc.assertDocumentInScope(user, {
        clientId: 'any',
        branchId: 'any-branch',
      }),
    ).resolves.toBeUndefined();
  });
});
