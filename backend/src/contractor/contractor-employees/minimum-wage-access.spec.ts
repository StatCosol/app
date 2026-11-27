import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request = require('supertest');
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { MinimumWageController } from './minimum-wage.controller';
import { MinimumWageService } from './minimum-wage.service';
import { MinimumWageEntity } from './entities/minimum-wage.entity';

describe('Nationwide minimum wage permissions over HTTP', () => {
  let app: INestApplication;
  const row = {
    id: 'test-rate',
    stateCode: 'TS',
    skillCategory: 'UNSKILLED',
    monthlyWage: 10000,
    effectiveFrom: '2026-11-01',
  };
  const repo = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => ({ ...row })),
    })),
    find: jest.fn(async () => [row]),
    findOne: jest.fn(async () => ({ ...row })),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    delete: jest.fn(async () => ({})),
  };
  const lookup = jest.fn(async () => row);
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MinimumWageController],
      providers: [
        { provide: getRepositoryToken(MinimumWageEntity), useValue: repo },
        { provide: MinimumWageService, useValue: { lookup } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI });
    // Test-only authenticated identity; the real RolesGuard is exercised.
    app.use((req, _res, next) => {
      if (req.headers['x-test-role'])
        req.user = { roleCode: req.headers['x-test-role'] };
      next();
    });
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  const mutations = [
    ['post', '', row, 201],
    ['put', '/test-rate', { monthlyWage: 12000 }, 200],
    ['delete', '/test-rate', {}, 200],
    ['post', '/bulk-import', { rows: [{ ...row, monthlyWage: 12000 }] }, 201],
  ] as const;
  describe.each(['CRM', 'CLIENT', 'CONTRACTOR', 'AUDITOR', 'PAYROLL', 'CCO'])(
    '%s',
    (role) => {
      it.each(mutations)('cannot %s %s', async (method, suffix, body) => {
        await request(app.getHttpServer())
          [method](`/v1/minimum-wages${suffix}`)
          .set('x-test-role', role)
          .send(body)
          .expect(403);
        expect(repo.findOne).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
        expect(repo.delete).not.toHaveBeenCalled();
      });
    },
  );
  it.each(mutations)(
    'Admin can %s %s',
    async (method, suffix, body, status) => {
      await request(app.getHttpServer())
        [method](`/v1/minimum-wages${suffix}`)
        .set('x-test-role', 'ADMIN')
        .send(body)
        .expect(status);
      expect(method === 'delete' ? repo.delete : repo.save).toHaveBeenCalled();
    },
  );
  it.each(['ADMIN', 'CRM', 'CLIENT', 'CONTRACTOR'])(
    '%s retains list and lookup access',
    async (role) => {
      await request(app.getHttpServer())
        .get('/v1/minimum-wages')
        .set('x-test-role', role)
        .expect(200);
      await request(app.getHttpServer())
        .get('/v1/minimum-wages/lookup?stateCode=TS&skillCategory=UNSKILLED')
        .set('x-test-role', role)
        .expect(200);
      expect(lookup).toHaveBeenCalledWith(
        'TS',
        'UNSKILLED',
        undefined,
        undefined,
      );
    },
  );
  it('rejects a missing authenticated role before creating a rate', async () => {
    await request(app.getHttpServer())
      .post('/v1/minimum-wages')
      .send(row)
      .expect(403);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
