import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request = require('supertest');
import { AppraisalScopeGuard } from './appraisal-scope.guard';
import { AppraisalCyclesController } from './controllers/appraisal-cycles.controller';
import { EmployeeAppraisalsController } from './controllers/employee-appraisals.controller';
import { AppraisalTemplatesController } from './controllers/appraisal-templates.controller';
import { AppraisalCyclesService } from './services/appraisal-cycles.service';
import { EmployeeAppraisalsService } from './services/employee-appraisals.service';
import { AppraisalTemplatesService } from './services/appraisal-templates.service';

describe('Appraisal tenant checks on HTTP routes', () => {
  let app: INestApplication;
  const id = '11111111-1111-4111-8111-111111111111';
  const query = jest.fn();
  const readOrWrite = jest.fn(async () => ({ ok: true }));
  const service = Object.fromEntries(
    [
      'findOne',
      'getHistory',
      'update',
      'activate',
      'close',
      'generateEmployees',
      'findOneTemplate',
      'findOneScale',
      'clientApprove',
      'sendBack',
      'lock',
    ].map((k) => [k, readOrWrite]),
  );
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        AppraisalCyclesController,
        EmployeeAppraisalsController,
        AppraisalTemplatesController,
      ],
      providers: [
        AppraisalScopeGuard,
        { provide: DataSource, useValue: { query } },
        { provide: AppraisalCyclesService, useValue: service },
        { provide: EmployeeAppraisalsService, useValue: service },
        { provide: AppraisalTemplatesService, useValue: service },
      ],
    }).compile();
    app = module.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI });
    app.use((req, _res, next) => {
      req.user = {
        id: 'test-client-user',
        roleCode: 'CLIENT',
        userType: 'CLIENT',
        clientId: 'client-a',
        branchIds: [],
      };
      next();
    });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockResolvedValue([{ client_id: 'client-b', branch_id: 'branch-b' }]);
  });
  it.each([
    ['get', `employees/${id}`],
    ['get', `employees/${id}/history`],
    ['get', `cycles/${id}`],
    ['put', `cycles/${id}`],
    ['post', `cycles/${id}/activate`],
    ['post', `cycles/${id}/close`],
    ['post', `cycles/${id}/generate`],
    ['get', `templates/${id}`],
    ['get', `templates/scales/${id}`],
    ['post', `employees/${id}/client-approve`],
    ['post', `employees/${id}/send-back`],
    ['post', `employees/${id}/lock`],
  ])(
    'rejects another tenant before service access: %s %s',
    async (method, route) => {
      await request(app.getHttpServer())
        [method](`/v1/appraisal/${route}`)
        .send({})
        .expect(403);
      expect(readOrWrite).not.toHaveBeenCalled();
    },
  );
  it('allows the client to read its own appraisal', async () => {
    query.mockResolvedValue([{ client_id: 'client-a', branch_id: 'branch-a' }]);
    await request(app.getHttpServer())
      .get(`/v1/appraisal/employees/${id}`)
      .expect(200);
    expect(readOrWrite).toHaveBeenCalledWith(id);
  });
});
