import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import helmet from 'helmet';
import request = require('supertest');
import { EsslIclockController } from './essl-iclock.controller';
import { EsslService } from './essl.service';

describe('eSSL replies are non-executable plain text', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [EsslIclockController],
      providers: [
        {
          provide: EsslService,
          useValue: {
            ingestAttlog: jest.fn(async () => 0),
            touch: jest.fn(async () => undefined),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(helmet()); // Same default nosniff middleware as main.ts.
    await app.init();
  });
  afterAll(async () => app.close());
  it.each(['ATTLOG', 'OPERLOG'])(
    'keeps an HTML-looking Stamp inert for %s',
    async (table) => {
      const stamp = '<script>alert(document.domain)</script>';
      const response = await request(app.getHttpServer())
        .post('/iclock/cdata')
        .query({ SN: 'TEST-ONLY', table, Stamp: stamp })
        .send({})
        .expect(200);
      expect(response.headers['content-type']).toMatch(/^text\/plain;/);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.text).toContain(stamp);
    },
  );
});
