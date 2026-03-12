import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FilesService } from './files.service';
import { PayrollInputFileEntity } from '../payroll/entities/payroll-input-file.entity';
import { RegistersRecordEntity } from '../payroll/entities/registers-record.entity';
import { HelpdeskMessageFileEntity } from '../helpdesk/entities/helpdesk-message-file.entity';
import { ContractorDocumentEntity } from '../contractor/entities/contractor-document.entity';
import { PayrollClientAssignmentEntity } from '../payroll/entities/payroll-client-assignment.entity';

describe('FilesService', () => {
  let service: FilesService;

  const mockRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        {
          provide: getRepositoryToken(PayrollInputFileEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(RegistersRecordEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(HelpdeskMessageFileEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(ContractorDocumentEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(PayrollClientAssignmentEntity),
          useValue: { ...mockRepo },
        },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
