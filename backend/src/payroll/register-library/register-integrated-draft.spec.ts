import { Test } from '@nestjs/testing';
import request = require('supertest');
import { RegisterBuilderService } from './register-builder.service';
import { RegisterLibraryController } from './register-library.controller';
import { RegisterLibraryService } from './register-library.service';
import { RegisterEvidenceService } from './register-evidence.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { GlobalExceptionFilter } from '../../common/filters/http-exception.filter';
import { BranchEntity } from '../../branches/entities/branch.entity';
import { ClientEntity } from '../../clients/entities/client.entity';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';

const form = 'ts--factories-1948--ts-integrated-2019--ii---iii--tsi';
const branchId = '94ad1c42-ea05-460e-b494-0a7e634de127';
describe('Integrated register HTTP preparation', () => {
  let app: any, run: any, query: jest.Mock, employeeRepo: any;
  beforeEach(async () => {
    run = {
      id: 'run',
      clientId: 'client',
      branchId,
      status: 'APPROVED',
      approvedAt: '2026-04-01',
      periodYear: 2026,
      periodMonth: 3,
    };
    employeeRepo = {
      find: jest.fn(async () => [
        {
          id: 'worker',
          employeeCode: 'E1',
          employeeName: 'Fictional Worker',
          designation: 'Operator',
          daysPresent: '26',
          otHours: '0',
          grossEarnings: '18000',
          netPay: '16000',
        },
      ]),
    };
    query = jest.fn(async (sql: string) =>
      sql.includes('unit_applicable_compliance')
        ? [
            {
              applicable: true,
              computedAt: '2026-10-02',
              factsUpdatedAt: '2026-10-01',
              government: 'STATE',
              factState: 'TS',
              establishmentType: 'FACTORY',
            },
          ]
        : [
            {
              runEmployeeId: 'worker',
              birthDate: '1990-01-01',
              gender: 'MALE',
              relativeName: 'Fictional Parent',
            },
          ],
    );
    const ds = {
      query,
      getRepository: (entity: any) => {
        if (entity === BranchEntity)
          return {
            findOneBy: async () => ({
              id: branchId,
              clientId: 'client',
              branchName: 'Test Factory',
              stateCode: 'TS',
              address: 'Test site address',
            }),
          };
        if (entity === ClientEntity)
          return { findOneBy: async () => ({ clientName: 'Test Employer' }) };
        if (entity === PayrollRunEntity) return { findOneBy: async () => run };
        if (entity === PayrollRunEmployeeEntity) return employeeRepo;
        throw Error('Unexpected persistence before complete validation');
      },
    };
    const builder = new RegisterBuilderService(
      ds as any,
      {
        assertBranchAllowed: jest.fn(),
        assertCcoBranchAllowed: jest.fn(),
        assertClientAllowed: jest.fn(),
      } as any,
    );
    const module = await Test.createTestingModule({
      controllers: [RegisterLibraryController],
      providers: [
        { provide: RegisterBuilderService, useValue: builder },
        {
          provide: RegisterLibraryService,
          useValue: new RegisterLibraryService(),
        },
        { provide: RegisterEvidenceService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterEach(async () => app?.close());
  const url = () => '/payroll/register-library/' + form;
  const load = () =>
    request(app.getHttpServer())
      .get(url() + '/prefill')
      .query({ branchId, runId: 'run', year: 2026, month: 3 });
  it('loads approved payroll and available profiles through the actual controller', async () => {
    const response = await load().expect(200);
    expect(response.body.metadata).toEqual({ employer: 'Test Employer' });
    expect(response.body.particulars.establishmentAddress).toBe(
      'Test site address',
    );
    expect(response.body.rows[0]).toMatchObject({
      name: 'Fictional Worker — E1',
      gross: '18000',
      net: '16000',
      sex: 'M',
      ageOrBirthDate: '1990-01-01',
      otHours: '0',
    });
    for (const key of [
      'fine',
      'maternity',
      'leaveBalance',
      'nominee',
      'otherDeductions',
    ])
      expect(response.body.rows[0]).not.toHaveProperty(key);
    expect(response.body.particulars).not.toHaveProperty('regularWorkers');
    expect(employeeRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId: 'run', clientId: 'client', branchId },
      }),
    );
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("e.approval_status='APPROVED'"),
      ['run', 'client', branchId],
    );
  });
  it.each([
    ['status', 'DRAFT', 400],
    ['periodMonth', 4, 400],
    ['clientId', 'other', 403],
    ['branchId', 'other', 403],
    ['approvedAt', null, 400],
  ])(
    'rejects mismatched %s before loading profiles',
    async (key, value, status) => {
      run[key] = value;
      await load().expect(status);
      expect(employeeRepo.find).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledTimes(1);
    },
  );
  it('loads the same employer and branch defaults for assigned contractor drafts', async () => {
    const contractorId = '11111111-1111-4111-8111-111111111111';
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('unit_applicable_compliance'))
        return [
          {
            applicable: true,
            computedAt: '2026-10-02',
            factsUpdatedAt: '2026-10-01',
            government: 'STATE',
            factState: 'TS',
            establishmentType: 'FACTORY',
          },
        ];
      if (sql.includes('branch_contractor'))
        return [{ id: contractorId, name: 'Assigned vendor' }];
      if (sql.includes('contractor_payroll_versions'))
        return [
          {
            id: 'published',
            rows_snapshot: [
              {
                employeeCode: 'C1',
                employeeName: 'Contract worker',
                matchStatus: 'MATCHED',
                totalEarnings: 1000,
                netSalary: 900,
                pfDeduction: 100,
                esiDeduction: 0,
              },
            ],
          },
        ];
      throw Error('Unexpected employee profile lookup for contractor');
    });
    const result = await request(app.getHttpServer())
      .get(url() + '/prefill')
      .query({ branchId, contractorId, year: 2026, month: 3 })
      .expect(200);
    expect(result.body.metadata.employer).toBe('Test Employer');
    expect(result.body.particulars.establishmentAddress).toBe(
      'Test site address',
    );
    expect(result.body.rows[0].name).toBe('Contract worker — C1');
    expect(result.body.sourceReference).toBe('Published payroll published');
    expect(employeeRepo.find).not.toHaveBeenCalled();
  });
  it('retains every missing-field error through the production exception filter', async () => {
    const response = await request(app.getHttpServer())
      .post(url() + '/generate')
      .send({
        branchId,
        year: 2026,
        month: 3,
        actingCapacity: 'DIRECT_EMPLOYER',
        rows: [{}],
      })
      .expect(400);
    expect(response.body.message).toBe('Complete the register details');
    expect(response.body.errors.length).toBeGreaterThan(5);
    expect(response.body.errors.join(' ')).toContain('employer');
    expect(query).not.toHaveBeenCalled();
  });
  it('does not require current HR linkage to retain the historical payroll workers', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('unit_applicable_compliance')
        ? [
            {
              applicable: true,
              computedAt: '2026-10-02',
              factsUpdatedAt: '2026-10-01',
              government: 'STATE',
              factState: 'TS',
              establishmentType: 'FACTORY',
            },
          ]
        : [],
    );
    const result = await load().expect(200);
    expect(result.body.rows).toHaveLength(1);
    expect(result.body.rows[0]).not.toHaveProperty('sex');
  });
});
