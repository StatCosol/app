import {
  INestApplication,
  UnauthorizedException,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { InvoicePdfEmailController } from './invoice-pdf-email.controller';
import { InvoicePdfService } from '../services/invoice-pdf.service';
import { InvoiceEmailService } from '../services/invoice-email.service';
import { InvoiceDeliveryService } from '../services/invoice-delivery.service';
import { InvoiceFileInventoryService } from '../services/invoice-file-inventory.service';
import { createGlobalValidationPipe } from '../../common/validators/global-validation-pipe';

describe('Invoice delivery HTTP permissions and validation', () => {
  let app: INestApplication;
  let role: string | undefined;
  const id = '00000000-0000-4000-8000-000000000001';
  const base = '/api/v1/billing';
  const deliveries = {
    resolve: jest.fn().mockResolvedValue({ success: true }),
  };
  const inventory = {
    preview: jest.fn().mockResolvedValue({ deletionEnabled: false, items: [] }),
  };
  const email = {
    findLogs: jest.fn().mockResolvedValue({ data: [] }),
    sendInvoice: jest.fn().mockResolvedValue({ success: true }),
  };
  const evidence = {
    outcome: 'SENT',
    note: 'Provider receipt verified',
    providerVerified: true,
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InvoicePdfEmailController],
      providers: [
        { provide: InvoicePdfService, useValue: {} },
        { provide: InvoiceEmailService, useValue: email },
        { provide: InvoiceDeliveryService, useValue: deliveries },
        { provide: InvoiceFileInventoryService, useValue: inventory },
      ],
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
    app.useGlobalPipes(createGlobalValidationPipe());
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
    'ACCOUNTS',
    'CLIENT',
    'BRANCH_DESK',
    'CRM',
    'AUDITOR',
    'CONTRACTOR',
    'CCO',
    'CEO',
    'PAYROLL',
  ])('denies %s administrator actions', async (roleCode) => {
    role = roleCode;
    await request(app.getHttpServer())
      .get(`${base}/pdf-retention-preview`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${base}/email-logs/${id}/resolve-delivery`)
      .send(evidence)
      .expect(403);
    expect(deliveries.resolve).not.toHaveBeenCalled();
    expect(inventory.preview).not.toHaveBeenCalled();
  });
  it('requires authentication', async () => {
    role = undefined;
    await request(app.getHttpServer()).get(`${base}/email-logs`).expect(401);
    await request(app.getHttpServer())
      .get(`${base}/pdf-retention-preview`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`${base}/email-logs/${id}/resolve-delivery`)
      .send(evidence)
      .expect(401);
  });
  it('allows accounts users to read logs but not change delivery outcomes', async () => {
    role = 'ACCOUNTS';
    await request(app.getHttpServer())
      .get(`${base}/email-logs?page=2&limit=10`)
      .expect(200);
    expect(email.findLogs).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 10 }),
    );
  });
  it('passes administrator identity, trimmed evidence and inventory age', async () => {
    await request(app.getHttpServer())
      .post(`${base}/email-logs/${id}/resolve-delivery`)
      .send({ ...evidence, note: '  Provider receipt verified  ' })
      .expect(201);
    expect(deliveries.resolve).toHaveBeenCalledWith(
      { userId: id, roleCode: 'ADMIN' },
      id,
      'SENT',
      evidence.note,
      true,
    );
    await request(app.getHttpServer())
      .get(`${base}/pdf-retention-preview?minAgeDays=730`)
      .expect(200);
    expect(inventory.preview).toHaveBeenCalledWith('ADMIN', 730);
  });
  it.each([
    { providerVerified: false },
    { providerVerified: 'true' },
    { providerVerified: 'false' },
    { providerVerified: 1 },
    { outcome: 'RETRY' },
    { note: 'short' },
    { note: 1234567890123 },
    { note: ' '.repeat(20) },
    { note: 'x'.repeat(2001) },
    { unexpected: true },
  ])('rejects invalid resolution %j', async (patch) => {
    await request(app.getHttpServer())
      .post(`${base}/email-logs/${id}/resolve-delivery`)
      .send({ ...evidence, ...patch })
      .expect(400);
    expect(deliveries.resolve).not.toHaveBeenCalled();
  });
  it.each(['page=0', 'page=abc', 'limit=101', 'invoiceId=invalid', 'extra=1'])(
    'rejects malformed log query %s',
    async (query) => {
      await request(app.getHttpServer())
        .get(`${base}/email-logs?${query}`)
        .expect(400);
      expect(email.findLogs).not.toHaveBeenCalled();
    },
  );
  it.each([
    'minAgeDays=0',
    'minAgeDays=1.5',
    'minAgeDays=36501',
    'delete=true',
  ])('rejects malformed inventory query %s', async (query) => {
    await request(app.getHttpServer())
      .get(`${base}/pdf-retention-preview?${query}`)
      .expect(400);
    expect(inventory.preview).not.toHaveBeenCalled();
  });
  it('rejects malformed identifiers and send keys before side effects', async () => {
    await request(app.getHttpServer())
      .post(`${base}/email-logs/invalid/resolve-delivery`)
      .send(evidence)
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base}/invoices/${id}/send-email`)
      .send({ toEmail: 'sample@example.invalid', requestId: 'invalid' })
      .expect(400);
    expect(deliveries.resolve).not.toHaveBeenCalled();
    expect(email.sendInvoice).not.toHaveBeenCalled();
  });
});
