import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AssignmentsService } from './assignments.service';
import { ClientAssignmentCurrentEntity } from './entities/client-assignment-current.entity';
import { ClientAssignmentHistoryEntity } from './entities/client-assignment-history.entity';
import { BranchAuditorAssignmentEntity } from './entities/branch-auditor-assignment.entity';
import { UsersService } from '../users/users.service';
import { ClientsService } from '../clients/clients.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

describe('AssignmentsService', () => {
  let service: AssignmentsService;
  const repoMock = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentsService,
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: getRepositoryToken(ClientAssignmentCurrentEntity), useValue: repoMock },
        { provide: getRepositoryToken(ClientAssignmentHistoryEntity), useValue: repoMock },
        { provide: getRepositoryToken(BranchAuditorAssignmentEntity), useValue: repoMock },
        { provide: UsersService, useValue: {} },
        { provide: ClientsService, useValue: {} },
        { provide: AuditLogsService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<AssignmentsService>(AssignmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
