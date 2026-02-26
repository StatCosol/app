import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import helmet from 'helmet';
import * as bodyParser from 'body-parser';
import { UsersService } from './users/users.service';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Secure headers
  app.use(helmet());

  // CORS configuration for Angular dev server
  // NOTE:
  // - In development you may access the backend from multiple devices on the same Wi-Fi.
  // - IPs change frequently, so we allow all origins in non-production.
  // - In production, restrict origins via CORS_ORIGINS (comma-separated).
  const isProd = process.env.NODE_ENV === 'production';
  const prodAllowedOrigins = (process.env.CORS_ORIGINS || 'https://statcosol.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, cb) => {
      // Allow server-to-server / curl / same-origin requests
      if (!origin) return cb(null, true);

      if (!isProd) {
        // Dev mode: allow any origin (LAN/mobile testing)
        return cb(null, true);
      }

      // Prod: allow only configured origins
      if (prodAllowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
  });

  // Global prefix for REST APIs; versioning adds /v1, /v2, ... on top
  app.setGlobalPrefix('api');

  // Nest versioning (URI based) with default v1; controllers without explicit versions remain accessible
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.url}`);
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });

  // Payload limits
  app.use(bodyParser.json({ limit: '2mb' }));

  // Serve uploaded files (e.g. compliance evidence)
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // Seed roles before starting the server
  const usersService = app.get(UsersService);
  await usersService.seedRolesIfEmpty();
  await usersService.seedAdminIfMissing();

  // Quick DB sanity: show current database and schema
  try {
    const ds = app.get(DataSource);
    const r = await ds.query(`
      select current_database() as db,
             current_schema() as schema,
             current_user as db_user,
             current_setting('search_path') as search_path
    `);
    logger.log('[DB CHECK]', r);
    logger.log(
      '[TABLE CHECK]',
      await ds.query("select to_regclass('public.compliance_master') as reg"),
    );
  } catch (err) {
    logger.warn('[DB CHECK] failed', err);
  }

  await app.listen(3000, '0.0.0.0');
  logger.log('Server running on http://0.0.0.0:3000');
}
void bootstrap();
