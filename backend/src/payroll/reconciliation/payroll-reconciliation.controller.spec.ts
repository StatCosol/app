import {
  INestApplication,
  ExecutionContext,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PayrollReconciliationController } from './payroll-reconciliation.controller';
import { PayrollReconciliationService } from './payroll-reconciliation.service';

describe('Register upload HTTP boundaries', () => {
  let app: INestApplication;
  let roleCode = 'PAYROLL';
  const compare = jest.fn().mockResolvedValue({ summary: { matched: 1 } });
  const route =
    '/api/v1/payroll/runs/00000000-0000-4000-8000-000000000001/reconcile-register';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PayrollReconciliationController],
      providers: [
        { provide: PayrollReconciliationService, useValue: { compare } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = { roleCode };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI });
    await app.init();
  });
  beforeEach(() => {
    roleCode = 'PAYROLL';
    compare.mockClear();
  });
  afterAll(async () => app.close());
  it('accepts a file as bounded multipart data', async () => {
    await request(app.getHttpServer())
      .post(route)
      .attach('file', Buffer.from('sample'), 'wages.csv')
      .expect(201);
    expect(compare).toHaveBeenCalledWith(
      { roleCode: 'PAYROLL' },
      expect.any(String),
      expect.objectContaining({
        originalname: 'wages.csv',
        buffer: Buffer.from('sample'),
      }),
    );
  });
  it('enforces role restrictions before invoking comparison', async () => {
    roleCode = 'CLIENT';
    await request(app.getHttpServer())
      .post(route)
      .attach('file', Buffer.from('sample'), 'wages.csv')
      .expect(403);
    expect(compare).not.toHaveBeenCalled();
  });
  it('rejects oversized files before invoking comparison', async () => {
    await request(app.getHttpServer())
      .post(route)
      .attach('file', Buffer.alloc(1024 * 1024 + 1), 'wages.csv')
      .expect(413);
    expect(compare).not.toHaveBeenCalled();
  });
  it('rejects invalid run identifiers and extra multipart fields', async () => {
    await request(app.getHttpServer())
      .post(route.replace('00000000-0000-4000-8000-000000000001', 'bad'))
      .attach('file', Buffer.from('sample'), 'wages.csv')
      .expect(400);
    await request(app.getHttpServer())
      .post(route)
      .field('clientId', 'another-tenant')
      .attach('file', Buffer.from('sample'), 'wages.csv')
      .expect(400);
    expect(compare).not.toHaveBeenCalled();
  });
});
