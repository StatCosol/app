import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccessScopeService } from './access-scope.service';
import { ClientAssignment } from '../assignments/entities/client-assignment.entity';
import { BranchAuditorAssignmentEntity } from '../assignments/entities/branch-auditor-assignment.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { PayrollClientAssignmentEntity } from '../payroll/entities/payroll-client-assignment.entity';

describe('AccessScopeService', () => {
  let service: AccessScopeService;

  const mockRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessScopeService,
        {
          provide: getRepositoryToken(ClientAssignment),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(BranchAuditorAssignmentEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(ClientEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(BranchEntity),
          useValue: { ...mockRepo },
        },
        {
          // PAYROLL resolves its scope from this table now, not GLOBAL_ROLES.
          provide: getRepositoryToken(PayrollClientAssignmentEntity),
          useValue: { ...mockRepo },
        },
      ],
    }).compile();

    service = module.get<AccessScopeService>(AccessScopeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
