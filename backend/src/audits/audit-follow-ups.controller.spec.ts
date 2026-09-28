import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditFollowUpsController } from './audit-follow-ups.controller';
import { AuditFollowUpsService } from './audit-follow-ups.service';

describe('Audit follow-up HTTP access', () => {
  let app: INestApplication;
  let role: string | undefined;
  const service = {
    list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    retry: jest.fn().mockResolvedValue({ status: 'PENDING' }),
  };
  const base = '/api/v1/admin/audit-follow-ups';
  const id = '00000000-0000-4000-8000-000000000001';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuditFollowUpsController],
      providers: [{ provide: AuditFollowUpsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context) {
          if (!role) throw new UnauthorizedException();
          context.switchToHttp().getRequest().user = {
            userId: id,
            roleCode: role,
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    role = 'ADMIN';
  });
  it.each([
    'CLIENT',
    'BRANCH_DESK',
    'CRM',
    'AUDITOR',
    'CONTRACTOR',
    'CCO',
    'CEO',
    'PAYROLL',
  ])('blocks %s from list and retry routes', async (roleCode) => {
    role = roleCode;
    await request(app.getHttpServer()).get(base).expect(403);
    await request(app.getHttpServer()).post(`${base}/${id}/retry`).expect(403);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.retry).not.toHaveBeenCalled();
  });
  it('requires authentication for both routes', async () => {
    role = undefined;
    await request(app.getHttpServer()).get(base).expect(401);
    await request(app.getHttpServer()).post(`${base}/${id}/retry`).expect(401);
  });
  it('passes validated admin queries to the service', async () => {
    await request(app.getHttpServer())
      .get(base + '?status=FAILED&page=2&limit=10')
      .expect(200);
    expect(service.list).toHaveBeenCalledWith(
      { userId: id, roleCode: 'ADMIN' },
      'FAILED',
      2,
      10,
    );
    await request(app.getHttpServer()).post(`${base}/${id}/retry`).expect(201);
    expect(service.retry).toHaveBeenCalledWith(
      { userId: id, roleCode: 'ADMIN' },
      id,
    );
  });
  it.each([
    'limit=101',
    'page=0',
    'page=abc',
    'status=INVALID',
    'unexpected=1',
  ])('rejects malformed query %s', async (query) => {
    await request(app.getHttpServer())
      .get(base + '?' + query)
      .expect(400);
    expect(service.list).not.toHaveBeenCalled();
  });
  it('rejects malformed job identifiers', async () => {
    await request(app.getHttpServer())
      .post(base + '/invalid/retry')
      .expect(400);
    expect(service.retry).not.toHaveBeenCalled();
  });
});
