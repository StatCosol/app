import { CrmDocumentsService } from './crm-documents.service';
import { ForbiddenException } from '@nestjs/common';

describe('branch unit document uploads', () => {
  const dto = {
    clientId: 'client-a',
    branchId: 'branch-a',
    scope: 'BRANCH',
    lawCategory: 'OTHER',
    documentType: 'Report',
  } as const;
  const file = {
    originalname: 'licence.pdf',
    buffer: Buffer.from('pdf'),
    mimetype: 'application/pdf',
  };
  function setup() {
    const repo = {
      save: jest.fn().mockResolvedValue({ id: 'doc-a', ...dto }),
      manager: { query: jest.fn().mockResolvedValue([{ id: 'branch-a' }]) },
    };
    Object.assign(repo.manager, {
      transaction: jest.fn(async (work) =>
        work({
          save: async (_entity, docs) => {
            repo.save(docs[0]);
            return docs;
          },
        }),
      ),
    });
    const svc = new CrmDocumentsService(repo as any, {} as any);
    const prepare = jest
      .spyOn(svc as any, 'prepareUploadRecord')
      .mockReturnValue({
        doc: { ...dto, uploadedBy: 'user-a' },
        fullPath: '/unused',
      });
    return { svc, repo, prepare };
  }
  it('saves mapped branch uploads in the shared unit document repository', async () => {
    const { svc, repo } = setup();
    await svc.uploadForBranch(dto, file, 'user-a', 'client-a', ['branch-a']);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'branch-a', uploadedBy: 'user-a' }),
    );
    expect(repo.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('clientid = $2'),
      ['branch-a', 'client-a'],
    );
  });
  it.each([
    [{ ...dto, branchId: 'branch-b' }, 'client-a', ['branch-a']],
    [{ ...dto, clientId: 'client-b' }, 'client-a', ['branch-a']],
    [dto, 'client-a', []],
    [
      { ...dto, scope: 'COMPANY', branchId: undefined },
      'client-a',
      ['branch-a'],
    ],
  ])(
    'rejects uploads outside the mapped branch',
    async (input, clientId, ids) => {
      const { svc, prepare } = setup();
      await expect(
        svc.uploadForBranch(
          input as any,
          file,
          'user-a',
          clientId,
          ids as string[],
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prepare).not.toHaveBeenCalled();
    },
  );
  it('denies a mapped branch that belongs to a different client', async () => {
    const { svc, repo, prepare } = setup();
    repo.manager.query.mockResolvedValue([]);
    await expect(
      svc.uploadForBranch(dto, file, 'user-a', 'client-a', ['branch-a']),
    ).rejects.toThrow('Branch does not belong');
    expect(prepare).not.toHaveBeenCalled();
  });
});
