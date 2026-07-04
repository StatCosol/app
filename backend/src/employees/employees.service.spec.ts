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
  let employeeRepo: any;
  let dataSource: any;
  let riskCache: any;

  const mockRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    employeeRepo = { ...mockRepo };
    dataSource = {
      query: jest.fn(),
      createQueryRunner: jest.fn().mockReturnValue({
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: { save: jest.fn() },
      }),
    };
    riskCache = {
      invalidate: jest.fn(),
      invalidateBranch: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        {
          provide: getRepositoryToken(EmployeeEntity),
          useValue: employeeRepo,
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
          useValue: dataSource,
        },
        {
          provide: AiRiskCacheInvalidatorService,
          useValue: riskCache,
        },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('syncs active face enrollment branch when an employee branch changes', async () => {
    employeeRepo.findOne.mockResolvedValue({
      id: 'emp-1',
      clientId: 'client-1',
      employeeCode: 'E001',
      name: 'Employee One',
      branchId: 'branch-old',
      monthlyGross: 30000,
      stateCode: null,
      uan: null,
      esic: null,
    });
    employeeRepo.save.mockImplementation(async (emp: any) => emp);
    jest
      .spyOn(service as any, 'assertMonthlyGrossMeetsMinimumWage')
      .mockResolvedValue(undefined);

    await service.update('client-1', 'emp-1', {
      branchId: 'branch-new',
    } as any);

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE face_enrollments'),
      ['branch-new', 'client-1', 'emp-1'],
    );
    expect(riskCache.invalidateBranch).toHaveBeenCalledWith('branch-old');
    expect(riskCache.invalidateBranch).toHaveBeenCalledWith('branch-new');
  });
});
