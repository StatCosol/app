import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import * as bodyParser from 'body-parser';
import { UsersService } from './users/users.service';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
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
  app.enableCors({
    origin: [
      'http://localhost:4200',
      'http://192.168.0.104:4200',
      'https://statcosol.com',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cache-Control',
      'Pragma',
      'Expires',
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
    console.log(`[REQUEST] ${req.method} ${req.url}`);
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
    console.log('[DB CHECK]', r);
    console.log(
      '[TABLE CHECK]',
      await ds.query("select to_regclass('public.compliance_master') as reg"),
    );
  } catch (err) {
    console.warn('[DB CHECK] failed', err);
  }

  await app.listen(3000, '0.0.0.0');
  console.log(`Server running on http://0.0.0.0:3000`);
}
void bootstrap();
