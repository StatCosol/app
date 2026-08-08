import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ComplianceDocumentsService } from './compliance-documents.service';
import { ComplianceDocLibraryEntity } from './entities/compliance-document.entity';
import { ComplianceDocumentVisibilityEntity } from './entities/compliance-document-visibility.entity';
import { CompanySettingsEntity } from './entities/company-settings.entity';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { BranchAccessService } from '../auth/branch-access.service';

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

describe('ComplianceDocumentsService', () => {
  let service: ComplianceDocumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceDocumentsService,
        { provide: getRepositoryToken(ComplianceDocLibraryEntity), useValue: repoMock() },
        { provide: getRepositoryToken(ComplianceDocumentVisibilityEntity), useValue: repoMock() },
        { provide: getRepositoryToken(CompanySettingsEntity), useValue: repoMock() },
        { provide: getRepositoryToken(ClientAssignmentCurrentEntity), useValue: repoMock() },
        { provide: getRepositoryToken(BranchEntity), useValue: repoMock() },
        { provide: BranchAccessService, useValue: {} },
      ],
    }).compile();

    service = module.get<ComplianceDocumentsService>(ComplianceDocumentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
