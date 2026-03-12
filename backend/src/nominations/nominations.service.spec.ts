import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NominationsService } from './nominations.service';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { EmployeeNominationEntity } from '../employees/entities/employee-nomination.entity';
import { EmployeeNominationMemberEntity } from '../employees/entities/employee-nomination-member.entity';
import { EmployeeGeneratedFormEntity } from '../employees/entities/employee-generated-form.entity';

describe('NominationsService', () => {
  let service: NominationsService;

  const mockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockReturnValue({}),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NominationsService,
        { provide: getRepositoryToken(EmployeeEntity), useValue: mockRepo() },
        {
          provide: getRepositoryToken(EmployeeNominationEntity),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(EmployeeNominationMemberEntity),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(EmployeeGeneratedFormEntity),
          useValue: mockRepo(),
        },
      ],
    }).compile();

    service = module.get<NominationsService>(NominationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
