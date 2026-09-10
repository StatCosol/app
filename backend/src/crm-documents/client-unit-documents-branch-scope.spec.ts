import { ForbiddenException } from '@nestjs/common';
import { ClientUnitDocumentsController } from './controllers/client-unit-documents.controller';

/**
 * A branch user is branch-scoped whichever endpoint they call.
 *
 * Their roleCode is CLIENT — only userType tells them apart — so
 * `@Roles('CLIENT')` admits them to the client controller as well as their own.
 * That controller filtered by client alone, and its download checked only that
 * the document belonged to the caller's client, so a branch user who called
 * /client/unit-documents instead of /branch/unit-documents listed and
 * downloaded every branch's documents in the company.
 */
describe('client unit-documents — branch users', () => {
  function makeController(scope: any) {
    const svc = {
      listForClient: jest.fn().mockResolvedValue(['ALL-COMPANY-DOCS']),
      listForBranch: jest.fn().mockResolvedValue(['MY-BRANCH-DOCS']),
      getDocumentForDownload: jest.fn().mockResolvedValue({
        absolutePath: '/tmp/f.pdf',
        fileName: 'f.pdf',
        mimeType: 'application/pdf',
      }),
      getClientIdsForBranchIds: jest.fn().mockResolvedValue(['client-a']),
    };
    const branchAccess = { assertBranchAccess: jest.fn() };
    const controller = new ClientUnitDocumentsController(
      svc as any,
      branchAccess as any,
      { getScope: jest.fn().mockResolvedValue(scope) } as any,
    );
    return { controller, svc, branchAccess };
  }

  const branchUser = {
    id: 'u1',
    userId: 'u1',
    roleCode: 'CLIENT',
    userType: 'BRANCH',
    clientId: 'client-a',
    branchIds: ['branch-1'],
  } as any;

  const masterUser = { ...branchUser, userType: 'MASTER', branchIds: [] };

  const branchScope = {
    level: 'branches',
    clientId: 'client-a',
    branchIds: ['branch-1'],
  };
  const clientScope = { level: 'client', clientId: 'client-a' };

  const res = () => ({ setHeader: jest.fn(), sendFile: jest.fn() }) as any;

  describe('listing', () => {
    it('gives a branch user only their branches, not the whole company', async () => {
      const { controller, svc } = makeController(branchScope);

      await expect(controller.list(branchUser, {})).resolves.toEqual([
        'MY-BRANCH-DOCS',
      ]);
      expect(svc.listForBranch).toHaveBeenCalledWith(
        ['branch-1'],
        expect.any(Object),
      );
      expect(svc.listForClient).not.toHaveBeenCalled();
    });

    it('refuses a branch user filtering to a branch they do not hold', async () => {
      const { controller, svc } = makeController(branchScope);

      await expect(
        controller.list(branchUser, { branchId: 'branch-9' }),
      ).rejects.toThrow(ForbiddenException);
      expect(svc.listForBranch).not.toHaveBeenCalled();
      expect(svc.listForClient).not.toHaveBeenCalled();
    });

    it('still gives a master user the whole company', async () => {
      const { controller, svc } = makeController(clientScope);

      await expect(controller.list(masterUser, {})).resolves.toEqual([
        'ALL-COMPANY-DOCS',
      ]);
      expect(svc.listForClient).toHaveBeenCalled();
    });

    it('returns nothing for a branch user with no mappings', async () => {
      // listForBranch answers [] for an empty list — a closed door, not an
      // open one.
      const { controller, svc } = makeController({
        level: 'branches',
        clientId: 'client-a',
        branchIds: [],
      });
      svc.listForBranch.mockResolvedValue([]);

      await expect(controller.list(branchUser, {})).resolves.toEqual([]);
      expect(svc.listForBranch).toHaveBeenCalledWith([], expect.any(Object));
    });
  });

  describe('download', () => {
    it('checks a branch user as a branch user', async () => {
      const { controller, svc } = makeController(branchScope);

      await controller.download('doc-1', branchUser, res());

      expect(svc.getDocumentForDownload).toHaveBeenCalledWith(
        'doc-1',
        'u1',
        'BRANCH_USER',
        expect.objectContaining({ allowedBranchIds: ['branch-1'] }),
      );
    });

    it('checks a master user as a client', async () => {
      const { controller, svc } = makeController(clientScope);

      await controller.download('doc-1', masterUser, res());

      expect(svc.getDocumentForDownload).toHaveBeenCalledWith(
        'doc-1',
        'u1',
        'CLIENT',
        { clientId: 'client-a' },
      );
    });

    it('does not hand a branch user the CLIENT path, which ignores branches', async () => {
      // This is the bug restated: the CLIENT path only compares clientId, so
      // routing a branch user through it is what exposed other branches.
      const { controller, svc } = makeController(branchScope);

      await controller.download('doc-1', branchUser, res());

      const role = svc.getDocumentForDownload.mock.calls[0][2];
      expect(role).not.toBe('CLIENT');
    });
  });
});
