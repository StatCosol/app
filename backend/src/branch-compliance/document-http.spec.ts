import 'reflect-metadata';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { BranchComplianceDocsController } from './controllers/branch-compliance-docs.controller';
import { CrmComplianceDocsController } from './controllers/crm-compliance-docs.controller';
import { BranchUnitDocumentsController } from '../crm-documents/controllers/branch-unit-documents.controller';
import { BranchComplianceService } from './branch-compliance.service';
import { CrmDocumentsService } from '../crm-documents/crm-documents.service';
import { BranchAccessService } from '../auth/branch-access.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('document multipart HTTP contracts', () => {
  let app: INestApplication;
  const branchId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
  const compliance = {
    uploadDocument: jest.fn(async (_user, dto, file) => ({
      ...dto,
      fileName: file.originalname,
    })),
    crmUploadOnBehalf: jest.fn(async (_user, dto, file) => ({
      ...dto,
      fileName: file.originalname,
    })),
    markNotApplicable: jest.fn(async (_user, dto) => dto),
  };
  const units = {
    uploadForBranch: jest.fn(async (dto, file, userId, clientId, ids) => ({
      ...dto,
      fileName: file.originalname,
      userId,
      clientId,
      ids,
    })),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        BranchComplianceDocsController,
        CrmComplianceDocsController,
        BranchUnitDocumentsController,
      ],
      providers: [
        { provide: BranchComplianceService, useValue: compliance },
        { provide: CrmDocumentsService, useValue: units },
        {
          provide: BranchAccessService,
          useValue: {
            getUserBranchIds: jest.fn().mockResolvedValue([branchId]),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI });
    app.use((req: any, _res: any, next: () => void) => {
      req.user = {
        id: 'test-user',
        userId: 'test-user',
        clientId: companyId,
        roleCode: req.headers['x-test-role'] || 'CLIENT',
        userType: 'BRANCH',
        branchIds: [branchId],
      };
      next();
    });
    app.useGlobalGuards(new RolesGuard(new Reflector()));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => jest.clearAllMocks());
  it.each([
    ['MONTHLY', 'periodMonth', '10'],
    ['QUARTERLY', 'periodQuarter', '4'],
    ['HALF_YEARLY', 'periodHalf', '2'],
    ['YEARLY', '', ''],
  ])(
    'accepts a real multipart %s branch request',
    async (frequency, key, value) => {
      let call = request(app.getHttpServer())
        .post('/api/v1/branch/compliance-docs/upload')
        .field('branchId', branchId)
        .field('returnCode', 'RETURN')
        .field('periodYear', '2026')
        .field('frequency', frequency);
      if (key) call = call.field(key, value);
      const response = await call
        .attach('file', pdf, {
          filename: 'return.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      expect(response.body.periodYear).toBe(2026);
      if (key) expect(response.body[key]).toBe(Number(value));
      expect(compliance.uploadDocument).toHaveBeenCalledTimes(1);
    },
  );
  it('validates and transforms the CRM upload class rather than bypassing it', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/crm/branch-compliance/upload-on-behalf')
      .set('x-test-role', 'CRM')
      .field('companyId', companyId)
      .field('branchId', branchId)
      .field('returnCode', 'RETURN')
      .field('periodYear', '2026')
      .field('frequency', 'YEARLY')
      .attach('file', pdf, {
        filename: 'annual.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(response.body.periodYear).toBe(2026);
    expect(response.body.companyId).toBe(companyId);
  });
  it('rejects the screenshot payload before calling the service', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/branch/compliance-docs/upload')
      .field('monthKey', '2026-10')
      .field('category', 'PT')
      .attach('file', pdf, {
        filename: 'return.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    expect(compliance.uploadDocument).not.toHaveBeenCalled();
  });
  it('requires a quarter and rejects an out-of-range period', async () => {
    for (const value of ['', '5']) {
      const call = request(app.getHttpServer())
        .post('/api/v1/branch/compliance-docs/upload')
        .field('branchId', branchId)
        .field('returnCode', 'RETURN')
        .field('periodYear', '2026')
        .field('frequency', 'QUARTERLY');
      if (value) call.field('periodQuarter', value);
      await call
        .attach('file', pdf, {
          filename: 'return.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);
    }
    expect(compliance.uploadDocument).not.toHaveBeenCalled();
  });
  it('rejects a file whose content does not match its PDF type', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/branch/compliance-docs/upload')
      .field('branchId', branchId)
      .field('returnCode', 'RETURN')
      .field('periodYear', '2026')
      .field('frequency', 'YEARLY')
      .attach('file', Buffer.from('this is not a PDF'), {
        filename: 'return.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    expect(compliance.uploadDocument).not.toHaveBeenCalled();
  });
  it('blocks client users from the CRM upload route', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/crm/branch-compliance/upload-on-behalf')
      .expect(403);
  });
  it('allows the BRANCH_DESK role to upload unit documents with validity dates', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/branch/unit-documents/upload')
      .set('x-test-role', 'BRANCH_DESK')
      .field('clientId', companyId)
      .field('branchId', branchId)
      .field('scope', 'BRANCH')
      .field('lawCategory', 'POLLUTION')
      .field('documentType', 'Renewal')
      .field('periodFrom', '2026-01-01')
      .field('periodTo', '2026-12-31')
      .attach('file', pdf, {
        filename: 'renewal.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(response.body.ids).toEqual([branchId]);
    expect(response.body.periodTo).toBe('2026-12-31');
  });
  it('rejects malformed unit validity dates', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/branch/unit-documents/upload')
      .field('clientId', companyId)
      .field('branchId', branchId)
      .field('scope', 'BRANCH')
      .field('lawCategory', 'OTHER')
      .field('documentType', 'Licence')
      .field('periodTo', '2026-02-31')
      .attach('file', pdf, {
        filename: 'licence.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    expect(units.uploadForBranch).not.toHaveBeenCalled();
  });
});
