import express from 'express';
import request from 'supertest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { uploadsAuthorization } from './uploads-authorization';

describe('static upload authorization', () => {
  function appFor(roleCode = 'CLIENT', denied = true) {
    const files = {
      assertCanDownload: jest.fn(async () => {
        if (denied) throw new ForbiddenException();
      }),
    };
    const strategy = {
      validate: jest.fn().mockResolvedValue({
        id: 'client-b-user',
        roleCode,
        clientId: 'client-b',
      }),
    };
    const jwt = {
      verify: jest
        .fn()
        .mockReturnValue({ sub: 'client-b-user', type: 'access' }),
    };
    const app = express();
    app.use(
      '/uploads',
      uploadsAuthorization(jwt as any, strategy as any, files as any),
    );
    app.use('/uploads', (_req, res) => res.send('file bytes'));
    return { app, files, strategy };
  }

  it.each([
    'invoices/a.pdf',
    'forms/a.pdf',
    'notices/a.pdf',
    'registrations/a.pdf',
    'returns/a.pdf',
    'compliance-docs/a.pdf',
  ])('does not bypass ownership for %s', async (p) => {
    const { app, files } = appFor();
    await request(app)
      .get('/uploads/' + p)
      .set('Authorization', 'Bearer test')
      .expect(403);
    expect(files.assertCanDownload).toHaveBeenCalled();
  });
  it.each([
    'payroll-breakups/a.xlsx',
    'payroll-run-employees/a.xlsx',
    'temp/a.pdf',
    'face-photos/a.jpg',
  ])('does not expose scratch or biometric files: %s', async (p) => {
    await request(appFor().app)
      .get('/uploads/' + p)
      .set('Authorization', 'Bearer test')
      .expect(404);
  });
  it('allows an authorized document and rejects an unregistered document', async () => {
    const { app, files } = appFor('CLIENT', false);
    await request(app)
      .get('/uploads/forms/a.pdf')
      .set('Authorization', 'Bearer test')
      .expect(200);
    files.assertCanDownload.mockRejectedValueOnce(new BadRequestException());
    await request(app)
      .get('/uploads/forms/missing.pdf')
      .set('Authorization', 'Bearer test')
      .expect(404);
  });
  it('rechecks active user status rather than trusting a signed token alone', async () => {
    const { app, strategy } = appFor();
    strategy.validate.mockRejectedValueOnce(new Error('Inactive user'));
    await request(app)
      .get('/uploads/forms/a.pdf')
      .set('Authorization', 'Bearer test')
      .expect(401);
  });
  it('only serves public images without authentication', async () => {
    const { app } = appFor();
    await request(app).get('/uploads/logos/a.png').expect(200);
    await request(app).get('/uploads/forms/a.pdf').expect(401);
    await request(app)
      .get('/uploads/logos/%2e%2e%2finvoices/a.pdf')
      .expect(404);
  });
});
