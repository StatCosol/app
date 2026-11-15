import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

describe('Support reply multipart limits (isolated HTTP)', () => {
  let app: INestApplication;
  const replyAsUser = jest.fn().mockResolvedValue({ status: 'OPEN' });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: { replyAsUser } }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = {
            id: 'TEST-USER',
            roleCode: 'CLIENT',
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });
  beforeEach(() => replyAsUser.mockClear());
  afterAll(async () => {
    await app?.close();
  });
  const body = Buffer.from('%PDF-1.4\nTEST ONLY\n');
  it.each([1, 2, 5])(
    'accepts %i supported attachments as one reply',
    async (count) => {
      let req = request(app.getHttpServer())
        .post('/notifications/threads/TEST-THREAD/reply')
        .field('message', 'TEST evidence');
      for (let i = 0; i < count; i++)
        req = req.attach('files', body, {
          filename: `TEST-${i}.pdf`,
          contentType: 'application/pdf',
        });
      await req.expect(201);
      expect(replyAsUser).toHaveBeenCalledTimes(1);
      expect(replyAsUser.mock.calls[0][3]).toHaveLength(count);
    },
  );
  it('rejects six attachments before reaching the service', async () => {
    let req = request(app.getHttpServer())
      .post('/notifications/threads/TEST-THREAD/reply')
      .field('message', 'TEST evidence');
    for (let i = 0; i < 6; i++)
      req = req.attach('files', body, {
        filename: `TEST-${i}.pdf`,
        contentType: 'application/pdf',
      });
    await req.expect(400);
    expect(replyAsUser).not.toHaveBeenCalled();
  });
  it('requires a message with attachments', async () => {
    await request(app.getHttpServer())
      .post('/notifications/threads/TEST-THREAD/reply')
      .field('message', '')
      .attach('files', body, {
        filename: 'TEST.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    expect(replyAsUser).not.toHaveBeenCalled();
  });
  it('rejects oversized attachments before reaching the service', async () => {
    await request(app.getHttpServer())
      .post('/notifications/threads/TEST-THREAD/reply')
      .field('message', 'TEST evidence')
      .attach('files', Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: 'TEST.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);
    expect(replyAsUser).not.toHaveBeenCalled();
  });
});
