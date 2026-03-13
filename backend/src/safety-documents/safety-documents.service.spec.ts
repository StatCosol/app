import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SafetyDocumentsService } from './safety-documents.service';
import { SafetyDocumentEntity } from './entities/safety-document.entity';

describe('SafetyDocumentsService', () => {
  let service: SafetyDocumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafetyDocumentsService,
        {
          provide: getRepositoryToken(SafetyDocumentEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SafetyDocumentsService>(SafetyDocumentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
