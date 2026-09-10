import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SafetyDocumentsService } from './safety-documents.service';
import { SafetyDocumentEntity } from './entities/safety-document.entity';
import { AccessScopeService } from '../access/access-scope.service';

/**
 * Downloading a safety document is access-checked by the service.
 *
 * It used to take only a docId and hand back the file, leaving every caller to
 * remember its own check. Two of the three remembered. The client controller
 * compared clientId alone — and a branch user's roleCode is CLIENT — so a
 * branch user could download any branch's safety document in the company. A
 * signature that cannot be called without a user is what stops that recurring.
 */
describe('SafetyDocumentsService', () => {
  async function build(doc: any, assertImpl?: jest.Mock) {
    const assertDocumentInScope =
      assertImpl ?? jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafetyDocumentsService,
        {
          provide: getRepositoryToken(SafetyDocumentEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(doc),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: AccessScopeService,
          useValue: { assertDocumentInScope },
        },
      ],
    }).compile();

    return {
      service: module.get<SafetyDocumentsService>(SafetyDocumentsService),
      assertDocumentInScope,
    };
  }

  const user = { id: 'u1', userId: 'u1', roleCode: 'CLIENT' } as any;

  it('should be defined', async () => {
    const { service } = await build(null);
    expect(service).toBeDefined();
  });

  it('checks the document against the caller before returning a path', async () => {
    const doc = {
      id: 'doc-1',
      clientId: 'client-a',
      branchId: 'branch-1',
      filePath: 'safety-documents/client-a/f.pdf',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
    };
    const { service, assertDocumentInScope } = await build(doc);

    // The file is absent on disk here, so the run stops after the check —
    // which is the thing being asserted.
    await expect(service.getDocumentForDownload('doc-1', user)).rejects.toThrow(
      NotFoundException,
    );

    expect(assertDocumentInScope).toHaveBeenCalledWith(user, doc);
  });

  it('refuses when the caller is out of scope, before touching the disk', async () => {
    const doc = {
      id: 'doc-1',
      clientId: 'client-a',
      branchId: 'branch-9',
      filePath: 'safety-documents/client-a/f.pdf',
    };
    const denied = jest.fn().mockRejectedValue(new ForbiddenException());
    const { service } = await build(doc, denied);

    await expect(service.getDocumentForDownload('doc-1', user)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses a stored path that climbs out of uploads/', async () => {
    // filePath is service-written from validated parts, so this is a guard
    // rather than a live hole — but FilesController holds the same one.
    const doc = {
      id: 'doc-1',
      clientId: 'client-a',
      branchId: null,
      filePath: '../../etc/passwd',
    };
    const { service } = await build(doc);

    await expect(service.getDocumentForDownload('doc-1', user)).rejects.toThrow(
      /Invalid document path/,
    );
  });

  it('reports a missing document rather than a scope error', async () => {
    const { service, assertDocumentInScope } = await build(null);

    await expect(service.getDocumentForDownload('nope', user)).rejects.toThrow(
      NotFoundException,
    );
    expect(assertDocumentInScope).not.toHaveBeenCalled();
  });
});
