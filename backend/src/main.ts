import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import * as bodyParser from 'body-parser';
import { UsersService } from './users/users.service';
import { DataSource } from 'typeorm';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { CacheHeaderInterceptor } from './common/interceptors/cache-header.interceptor';
import { Logger as PinoLogger } from 'nestjs-pino';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Wire pino as the application logger
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter — standardises all error responses
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global cache-control interceptor — defaults no-cache; use @CacheControl() to opt-in
  const reflector = app.get('Reflector');
  app.useGlobalInterceptors(new CacheHeaderInterceptor(reflector));

  // Secure headers
  app.use(helmet());

  // Response compression
  app.use(compression());

  // Swagger / OpenAPI documentation (disabled in production)
  if (config.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('StatComPy API')
      .setDescription('Compliance Management Platform — REST API documentation')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT',
      )
      .addServer(
        `http://localhost:${config.get<number>('PORT', 3000)}`,
        'Local dev',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log('Swagger docs available at /api-docs');
  }

  // CORS configuration for Angular dev server
  // NOTE:
  // - In development you may access the backend from multiple devices on the same Wi-Fi.
  // - IPs change frequently, so we allow all origins in non-production.
  // - In production, restrict origins via CORS_ORIGINS (comma-separated).
  const isProd = config.get<string>('NODE_ENV') === 'production';
  const prodAllowedOrigins = config
    .get<string>('CORS_ORIGINS', 'https://statcosol.com')
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
      'X-Encrypted',
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

  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.url}`);
    next();
  });

  // Payload limits
  app.use(bodyParser.json({ limit: '2mb' }));

  // Serve uploaded files behind JWT authentication.
  // Previously: app.useStaticAssets('uploads/') — unauthenticated (SECURITY FIX)
  const jwtService = app.get(JwtService);
  app.use('/uploads', (req: Request, res: Response, next: NextFunction) => {
    // Logos and news images are non-sensitive assets — serve publicly
    if (req.path.startsWith('/logos/') || req.path.startsWith('/news/')) {
      return next();
    }

    // Extract token from Authorization header only.
    let token = '';
    const authHeader = req.headers?.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: 'Authentication required',
        error: 'Unauthorized',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const payload = jwtService.verify(token);
      if (payload?.type !== 'access') {
        return res.status(401).json({
          success: false,
          statusCode: 401,
          message: 'Invalid token type',
          error: 'Unauthorized',
          path: req.originalUrl,
          method: req.method,
          timestamp: new Date().toISOString(),
        });
      }
      // Token is valid — proceed to static file serving
      next();
    } catch {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: 'Invalid or expired token',
        error: 'Unauthorized',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // Seed roles/admin before starting the server unless explicitly disabled (CI/bootstrap flows).
  const usersService = app.get(UsersService);
  if (config.get<string>('SKIP_BOOTSTRAP_SEED') === 'true') {
    logger.warn('Skipping bootstrap seed due to SKIP_BOOTSTRAP_SEED=true');
  } else {
    await usersService.seedRolesIfEmpty();
    await usersService.seedAdminIfMissing();
  }

  // ── Critical schema validation ──────────────────────────────────
  // Verify that essential tables exist before the server accepts traffic.
  // Exits with a clear error message so missing migrations are caught early.
  {
    const ds = app.get(DataSource);

    // ── Idempotent incremental migrations (run on every boot, safe to re-run) ──
    // These use ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS so they are
    // no-ops if the schema is already up to date.
    try {
      await ds.query(`
        ALTER TABLE payroll_run_employees
          ADD COLUMN IF NOT EXISTS pf_employee  numeric(14,2) DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS esi_employee numeric(14,2) DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS pt           numeric(14,2) DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS pf_employer  numeric(14,2) DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS esi_employer numeric(14,2) DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS bonus        numeric(14,2) DEFAULT NULL
      `);
      logger.log('Schema patch: payroll_run_employees component columns OK');
    } catch (e: any) {
      logger.warn(`Schema patch payroll_run_employees skipped: ${e?.message}`);
    }

    const CRITICAL_TABLES = [
      'users',
      'roles',
      'clients',
      'client_branches',
      'compliance_master',
      'compliance_tasks',
      'compliance_doc_library',
      'compliance_returns',
      'compliance_documents',
      'audits',
      'audit_observations',
      'branch_documents',
      'safety_documents',
      'notifications',
    ];

    const result = await ds.query(
      `SELECT unnest($1::text[]) AS tbl,
              to_regclass('public.' || unnest($1::text[])) AS reg`,
      [CRITICAL_TABLES],
    );

    const missing = result
      .filter((r: { tbl: string; reg: string | null }) => !r.reg)
      .map((r: { tbl: string }) => r.tbl);

    if (missing.length > 0) {
      logger.error(
        `FATAL: ${missing.length} critical table(s) missing: ${missing.join(', ')}. ` +
          'Run "npm run db:migrate:sql" to apply pending migrations.',
      );
      if (config.get<string>('ALLOW_MISSING_TABLES') !== 'true') {
        process.exit(1);
      }
      logger.warn(
        'Continuing despite missing tables (ALLOW_MISSING_TABLES=true)',
      );
    } else {
      logger.log(
        `Schema OK — all ${CRITICAL_TABLES.length} critical tables verified.`,
      );
    }

    // Extended diagnostics (dev only)
    if (config.get<string>('NODE_ENV') !== 'production') {
      try {
        const r = await ds.query(`
          select current_database() as db,
                 current_schema() as schema,
                 current_user as db_user,
                 current_setting('search_path') as search_path
        `);
        logger.log('[DB CHECK]', r);
      } catch (err) {
        logger.warn('[DB CHECK] failed', err);
      }
    }
  }

  // ── Production env-var validation warnings ─────────────────────
  if (isProd) {
    if (!config.get<string>('JWT_SECRET'))
      logger.warn('⚠ JWT_SECRET not set — using insecure default');
    if (!config.get<string>('AI_ENCRYPTION_KEY'))
      logger.warn(
        '⚠ AI_ENCRYPTION_KEY not set — AI features will use dev fallback key',
      );
    if (
      config.get<string>('EMAIL_ENABLED', '').toLowerCase() === 'true' &&
      !config.get<string>('SMTP_PASS')
    ) {
      logger.warn(
        '⚠ EMAIL_ENABLED=true but SMTP_PASS not set — emails will fail',
      );
    }
  }

  const port = config.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Server running on http://0.0.0.0:${port}`);
}
void bootstrap();
