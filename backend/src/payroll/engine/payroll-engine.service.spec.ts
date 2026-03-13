import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PayrollEngineService } from './payroll-engine.service';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';
import { PayrollRunItemEntity } from '../entities/payroll-run-item.entity';
import { PayrollRunComponentValueEntity } from '../entities/payroll-run-component-value.entity';
import { PayrollComponentEntity } from '../entities/payroll-component.entity';
import { PayrollClientSetupEntity } from '../entities/payroll-client-setup.entity';
import { PayCalcTraceEntity } from '../entities/pay-calc-trace.entity';
import { EmployeeEntity } from '../../employees/entities/employee.entity';
import { StructureResolverService } from './structure-resolver.service';
import { RulesetResolverService } from './ruleset-resolver.service';
import { StatutoryCalculatorService } from '../services/statutory-calculator.service';
import { StateStatutoryService } from '../services/state-statutory.service';
import { RoundingService } from './rounding.service';
import { WageBaseService } from './wage-base.service';

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
});

describe('PayrollEngineService', () => {
  let service: PayrollEngineService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PayrollEngineService,
        { provide: getRepositoryToken(PayrollRunEntity), useFactory: mockRepo },
        {
          provide: getRepositoryToken(PayrollRunEmployeeEntity),
          useFactory: mockRepo,
        },
        {
          provide: getRepositoryToken(PayrollRunItemEntity),
          useFactory: mockRepo,
        },
        {
          provide: getRepositoryToken(PayrollRunComponentValueEntity),
          useFactory: mockRepo,
        },
        {
          provide: getRepositoryToken(PayrollComponentEntity),
          useFactory: mockRepo,
        },
        {
          provide: getRepositoryToken(PayrollClientSetupEntity),
          useFactory: mockRepo,
        },
        {
          provide: getRepositoryToken(PayCalcTraceEntity),
          useFactory: mockRepo,
        },
        { provide: getRepositoryToken(EmployeeEntity), useFactory: mockRepo },
        { provide: DataSource, useValue: { createQueryRunner: jest.fn() } },
        { provide: StructureResolverService, useValue: { resolve: jest.fn() } },
        {
          provide: RulesetResolverService,
          useValue: { resolveAndLoad: jest.fn(), loadParameters: jest.fn() },
        },
        {
          provide: StatutoryCalculatorService,
          useValue: { compute: jest.fn().mockReturnValue({ values: {} }) },
        },
        {
          provide: StateStatutoryService,
          useValue: { applyStateDeductions: jest.fn().mockResolvedValue({}) },
        },
        { provide: RoundingService, useValue: { round: jest.fn() } },
        {
          provide: WageBaseService,
          useValue: {
            computeWageBases: jest
              .fn()
              .mockReturnValue({ pfWage: 0, esiWage: 0, gross: 0 }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(PayrollEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
