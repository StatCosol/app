import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CrmDocumentsService } from './crm-documents.service';
import { CrmUnitDocumentEntity } from './entities/crm-unit-document.entity';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';

describe('CrmDocumentsService', () => {
  let service: CrmDocumentsService;

  const mockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockReturnValue({}),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmDocumentsService,
        {
          provide: getRepositoryToken(CrmUnitDocumentEntity),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(ClientAssignmentCurrentEntity),
          useValue: mockRepo(),
        },
      ],
    }).compile();

    service = module.get<CrmDocumentsService>(CrmDocumentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
