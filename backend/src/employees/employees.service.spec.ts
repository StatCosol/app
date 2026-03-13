import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmployeesService } from './employees.service';
import { EmployeeEntity } from './entities/employee.entity';
import { EmployeeSequenceEntity } from './entities/employee-sequence.entity';
import { EmployeeNominationEntity } from './entities/employee-nomination.entity';
import { EmployeeNominationMemberEntity } from './entities/employee-nomination-member.entity';
import { EmployeeGeneratedFormEntity } from './entities/employee-generated-form.entity';
import { AiRiskCacheInvalidatorService } from '../ai/ai-risk-cache-invalidator.service';

describe('EmployeesService', () => {
  let service: EmployeesService;

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
        EmployeesService,
        {
          provide: getRepositoryToken(EmployeeEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(EmployeeSequenceEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(EmployeeNominationEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(EmployeeNominationMemberEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(EmployeeGeneratedFormEntity),
          useValue: { ...mockRepo },
        },
        {
          provide: DataSource,
          useValue: {
            query: jest.fn(),
            createQueryRunner: jest.fn().mockReturnValue({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              manager: { save: jest.fn() },
            }),
          },
        },
        {
          provide: AiRiskCacheInvalidatorService,
          useValue: { invalidate: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
