import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContractorService } from './contractor.service';
import { BranchContractorEntity } from '../branches/entities/branch-contractor.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { BranchComplianceEntity } from '../checklists/entities/branch-compliance.entity';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { UserEntity } from '../users/entities/user.entity';
import { ContractorDocumentEntity } from './entities/contractor-document.entity';
import { AuditEntity } from '../audits/entities/audit.entity';
import { UsersService } from '../users/users.service';
import { AssignmentsService } from '../assignments/assignments.service';

describe('ContractorService', () => {
  let service: ContractorService;

  const mockRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractorService,
        {
          provide: getRepositoryToken(BranchContractorEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(BranchEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(BranchComplianceEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(ComplianceMasterEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(ClientEntity),
          useValue: { ...mockRepo },
        },
        { provide: getRepositoryToken(UserEntity), useValue: { ...mockRepo } },
        {
          provide: getRepositoryToken(ContractorDocumentEntity),
          useValue: { ...mockRepo },
        },
        { provide: getRepositoryToken(AuditEntity), useValue: { ...mockRepo } },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        {
          provide: AssignmentsService,
          useValue: { getAssignmentsForUser: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<ContractorService>(ContractorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
