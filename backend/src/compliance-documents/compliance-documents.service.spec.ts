import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ComplianceDocumentsService } from './compliance-documents.service';
import { ComplianceDocLibraryEntity } from './entities/compliance-document.entity';
import { ComplianceDocumentVisibilityEntity } from './entities/compliance-document-visibility.entity';
import { CompanySettingsEntity } from './entities/company-settings.entity';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { BranchAccessService } from '../auth/branch-access.service';
import { ForbiddenException } from '@nestjs/common';
import * as fs from 'fs';

jest.mock('fs', () => ({ ...jest.requireActual('fs'), existsSync: jest.fn() }));

const repoMock = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  save: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  }),
});

describe('Compliance document library permissions', () => {
  const clientId = 'client-1';
  let service: ComplianceDocumentsService;
  let docs: ReturnType<typeof repoMock>;
  let settings: ReturnType<typeof repoMock>;
  let access: { isMasterUser: jest.Mock; getUserBranchIds: jest.Mock };

  beforeEach(() => {
    docs = repoMock();
    settings = repoMock();
    access = {
      isMasterUser: jest.fn().mockResolvedValue(false),
      getUserBranchIds: jest.fn().mockResolvedValue([]),
    };
    service = new ComplianceDocumentsService(
      docs as any,
      repoMock() as any,
      settings as any,
      repoMock() as any,
      repoMock() as any,
      access as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('denies branch users changing restrictions before reading or writing settings', async () => {
    await expect(
      service.updateCompanySettings(clientId, 'branch-user', {
        allowBranchWageRegisters: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(settings.findOne).not.toHaveBeenCalled();
    expect(settings.save).not.toHaveBeenCalled();
  });

  it('requires a client scope even for a master user', async () => {
    access.isMasterUser.mockResolvedValue(true);
    await expect(
      service.updateCompanySettings(undefined as any, 'master', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(settings.findOne).not.toHaveBeenCalled();
  });

  it('does not promote an explicit branch user with no mappings to master access', async () => {
    access.isMasterUser.mockResolvedValue(true);
    docs.findOne.mockResolvedValue({
      clientId,
      branchId: null,
      category: 'RETURN',
    });
    await expect(
      service.listForClient(clientId, 'branch-user', {}, 'BRANCH'),
    ).resolves.toEqual([]);
    await expect(
      service.getDocumentForDownload(
        'doc',
        'branch-user',
        'CLIENT',
        clientId,
        'BRANCH',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.updateCompanySettings(clientId, 'branch-user', {}, 'BRANCH'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(settings.save).not.toHaveBeenCalled();
  });

  it('allows master updates and preserves settings omitted from the patch', async () => {
    access.isMasterUser.mockResolvedValue(true);
    settings.findOne.mockResolvedValue({
      clientId,
      settings: {
        allowBranchWageRegisters: true,
        allowBranchSalaryRegisters: false,
      },
    });
    settings.save.mockImplementation(async (row) => row);
    await expect(
      service.updateCompanySettings(clientId, 'master', {
        allowBranchWageRegisters: false,
      }),
    ).resolves.toEqual({
      allowBranchWageRegisters: false,
      allowBranchSalaryRegisters: false,
    });
    expect(settings.save).toHaveBeenCalledWith(
      expect.objectContaining({ clientId, updatedBy: 'master' }),
    );
  });

  it('keeps company document downloads denied when the branch list is empty', async () => {
    docs.findOne.mockResolvedValue({
      clientId,
      branchId: null,
      category: 'RETURN',
    });
    const diskCheck = jest.mocked(fs.existsSync).mockReturnValue(true);
    await expect(
      service.listForClient(clientId, 'branch-user', {}),
    ).resolves.toEqual([]);
    await expect(
      service.getDocumentForDownload(
        'doc-1',
        'branch-user',
        'CLIENT',
        clientId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(diskCheck).not.toHaveBeenCalled();
  });

  it('allows assigned branch users to download company documents', async () => {
    access.getUserBranchIds.mockResolvedValue(['branch-1']);
    docs.findOne.mockResolvedValue({
      clientId,
      branchId: null,
      category: 'RETURN',
      filePath: 'doc.pdf',
      fileName: 'doc.pdf',
    });
    jest.mocked(fs.existsSync).mockReturnValue(true);
    await expect(
      service.getDocumentForDownload(
        'doc-1',
        'branch-user',
        'CLIENT',
        clientId,
      ),
    ).resolves.toEqual(expect.objectContaining({ fileName: 'doc.pdf' }));
  });

  it('still blocks restricted wage registers for assigned branch users', async () => {
    access.getUserBranchIds.mockResolvedValue(['branch-1']);
    docs.findOne.mockResolvedValue({
      clientId,
      branchId: null,
      category: 'REGISTER',
      subCategory: 'WAGE',
    });
    settings.findOne.mockResolvedValue({
      settings: { allowBranchWageRegisters: false },
    });
    await expect(
      service.getDocumentForDownload(
        'doc-1',
        'branch-user',
        'CLIENT',
        clientId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ComplianceDocumentsService', () => {
  let service: ComplianceDocumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceDocumentsService,
        {
          provide: getRepositoryToken(ComplianceDocLibraryEntity),
          useValue: repoMock(),
        },
        {
          provide: getRepositoryToken(ComplianceDocumentVisibilityEntity),
          useValue: repoMock(),
        },
        {
          provide: getRepositoryToken(CompanySettingsEntity),
          useValue: repoMock(),
        },
        {
          provide: getRepositoryToken(ClientAssignmentCurrentEntity),
          useValue: repoMock(),
        },
        { provide: getRepositoryToken(BranchEntity), useValue: repoMock() },
        { provide: BranchAccessService, useValue: {} },
      ],
    }).compile();

    service = module.get<ComplianceDocumentsService>(
      ComplianceDocumentsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
