import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import {
  ValidationPipe,
  VersioningType,
  Logger,
  RequestMethod,
} from '@nestjs/common';
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

  // Global prefix for REST APIs; versioning adds /v1, /v2, ... on top.
  // /iclock/* is reserved for eSSL/ZKTeco device push (no prefix, no version).
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'iclock', method: RequestMethod.ALL },
      { path: 'iclock/(.*)', method: RequestMethod.ALL },
    ],
  });

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
  // eSSL/ZKTeco devices POST attendance logs as plain text (TSV) to /iclock/cdata
  app.use('/iclock', bodyParser.text({ type: '*/*', limit: '2mb' }));

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

    try {
      await ds.query(`
        ALTER TABLE clients
          ADD COLUMN IF NOT EXISTS crm_on_behalf_enabled BOOLEAN NOT NULL DEFAULT true
      `);
      // Enable for all existing clients (column may have been added with DEFAULT false)
      await ds.query(`
        UPDATE clients SET crm_on_behalf_enabled = true WHERE crm_on_behalf_enabled = false
      `);
      logger.log(
        'Schema patch: clients.crm_on_behalf_enabled OK (all clients enabled)',
      );
    } catch (e: any) {
      logger.warn(
        `Schema patch clients.crm_on_behalf_enabled skipped: ${e?.message}`,
      );
    }

    try {
      await ds.query(`
        ALTER TABLE compliance_documents
          ADD COLUMN IF NOT EXISTS uploaded_by_role    VARCHAR(20)  DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS acting_on_behalf    BOOLEAN      NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS original_owner_role VARCHAR(20)  DEFAULT NULL
      `);
      logger.log('Schema patch: compliance_documents CRM on-behalf columns OK');
    } catch (e: any) {
      logger.warn(
        `Schema patch compliance_documents on-behalf columns skipped: ${e?.message}`,
      );
    }

    try {
      await ds.query(`
        ALTER TABLE employee_nominations
          ADD COLUMN IF NOT EXISTS client_id           UUID,
          ADD COLUMN IF NOT EXISTS branch_id           UUID,
          ADD COLUMN IF NOT EXISTS submitted_at        TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS approved_at         TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS approved_by_user_id UUID,
          ADD COLUMN IF NOT EXISTS rejection_reason    TEXT
      `);
      await ds.query(`
        UPDATE employee_nominations en
        SET client_id = e.client_id,
            branch_id = e.branch_id
        FROM employees e
        WHERE en.employee_id = e.id
          AND en.client_id IS NULL
      `);
      await ds.query(
        `CREATE INDEX IF NOT EXISTS idx_emp_nom_client   ON employee_nominations (client_id)`,
      );
      await ds.query(
        `CREATE INDEX IF NOT EXISTS idx_emp_nom_branch   ON employee_nominations (branch_id)`,
      );
      await ds.query(
        `CREATE INDEX IF NOT EXISTS idx_emp_nom_status   ON employee_nominations (status)`,
      );
      await ds.query(
        `CREATE INDEX IF NOT EXISTS idx_emp_nom_approver ON employee_nominations (approved_by_user_id)`,
      );
      logger.log('Schema patch: employee_nominations workflow columns OK');
    } catch (e: any) {
      logger.warn(`Schema patch employee_nominations skipped: ${e?.message}`);
    }

    try {
      await ds.query(`
        ALTER TABLE employee_nomination_members
          ADD COLUMN IF NOT EXISTS guardian_relationship VARCHAR(60)  DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS guardian_address      TEXT         DEFAULT NULL
      `);
      logger.log(
        'Schema patch: employee_nomination_members guardian columns OK',
      );
    } catch (e: any) {
      logger.warn(
        `Schema patch employee_nomination_members guardian columns skipped: ${e?.message}`,
      );
    }

    try {
      await ds.query(`
        ALTER TABLE employees
          ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20) DEFAULT NULL
      `);
      logger.log('Schema patch: employees.marital_status OK');
    } catch (e: any) {
      logger.warn(
        `Schema patch employees.marital_status skipped: ${e?.message}`,
      );
    }

    try {
      await ds.query(`
        ALTER TABLE employees
          ADD COLUMN IF NOT EXISTS pf_service_start_date DATE         DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS basic_at_pf_start     NUMERIC(12,2) DEFAULT NULL
      `);
      logger.log('Schema patch: employees PF service columns OK');
    } catch (e: any) {
      logger.warn(
        `Schema patch employees PF service columns skipped: ${e?.message}`,
      );
    }

    // ── ESS Leave tables (created here so they exist even if the
    //    20260320_schema_reconciliation_v2 migration was not manually run) ──
    try {
      await ds.query(`
        CREATE TABLE IF NOT EXISTS leave_policies (
          id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id             UUID NOT NULL,
          branch_id             UUID,
          leave_type            VARCHAR(30) NOT NULL,
          leave_name            VARCHAR(100) NOT NULL,
          accrual_method        VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
          accrual_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
          carry_forward_limit   NUMERIC(5,2) NOT NULL DEFAULT 0,
          yearly_limit          NUMERIC(5,2) NOT NULL DEFAULT 0,
          allow_negative        BOOLEAN NOT NULL DEFAULT FALSE,
          min_notice_days       INT NOT NULL DEFAULT 0,
          max_days_per_request  NUMERIC(5,2) NOT NULL DEFAULT 0,
          requires_document     BOOLEAN NOT NULL DEFAULT FALSE,
          is_active             BOOLEAN NOT NULL DEFAULT TRUE,
          created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await ds.query(
        `CREATE INDEX IF NOT EXISTS idx_lp_client      ON leave_policies (client_id)`,
      );
      await ds.query(
        `CREATE INDEX IF NOT EXISTS idx_lp_client_type ON leave_policies (client_id, leave_type)`,
      );
      logger.log('Schema patch: leave_policies table OK');
    } catch (e: any) {
      logger.warn(`Schema patch leave_policies skipped: ${e?.message}`);
    }

    try {
      await ds.query(`
        CREATE TABLE IF NOT EXISTS leave_balances (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          employee_id     UUID NOT NULL,
          client_id       UUID NOT NULL,
          year            INT NOT NULL,
          leave_type      VARCHAR(30) NOT NULL,
          opening         NUMERIC(5,2) NOT NULL DEFAULT 0,
          accrued         NUMERIC(5,2) NOT NULL DEFAULT 0,
          used            NUMERIC(5,2) NOT NULL DEFAULT 0,
          lapsed          NUMERIC(5,2) NOT NULL DEFAULT 0,
          available       NUMERIC(5,2) NOT NULL DEFAULT 0,
          last_updated_at TIMESTAMPTZ,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (employee_id, year, leave_type)
        )
      `);
      await ds.query(
        `CREATE INDEX IF NOT EXISTS idx_lb_employee ON leave_balances (employee_id)`,
      );
      await ds.query(
        `CREATE INDEX IF NOT EXISTS idx_lb_client   ON leave_balances (client_id)`,
      );
      logger.log('Schema patch: leave_balances table OK');
    } catch (e: any) {
      logger.warn(`Schema patch leave_balances skipped: ${e?.message}`);
    }

    try {
      await ds.query(`
        CREATE TABLE IF NOT EXISTS leave_applications (
          id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          employee_id      UUID NOT NULL,
          client_id        UUID NOT NULL,
          branch_id        UUID,
          leave_type       VARCHAR(30) NOT NULL,
          from_date        DATE NOT NULL,
          to_date          DATE NOT NULL,
          total_days       NUMERIC(5,2) NOT NULL,
          reason           TEXT,
          status           VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
          approver_user_id UUID,
          applied_at       TIMESTAMPTZ,
          actioned_at      TIMESTAMPTZ,
          rejection_reason TEXT,
          attachment_path  TEXT,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await ds.query(
        `CREATE INDEX IF NOT EXISTS idx_la_employee ON leave_applications (employee_id)`,
      );
      await ds.query(
        `CREATE INDEX IF NOT EXISTS idx_la_client   ON leave_applications (client_id)`,
      );
      await ds.query(
        `CREATE INDEX IF NOT EXISTS idx_la_branch   ON leave_applications (branch_id)`,
      );
      await ds.query(
        `CREATE INDEX IF NOT EXISTS idx_la_approver ON leave_applications (approver_user_id)`,
      );
      logger.log('Schema patch: leave_applications table OK');
    } catch (e: any) {
      logger.warn(`Schema patch leave_applications skipped: ${e?.message}`);
    }

    try {
      await ds.query(`
        CREATE TABLE IF NOT EXISTS leave_ledger (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          employee_id UUID NOT NULL,
          client_id   UUID NOT NULL,
          leave_type  VARCHAR(30) NOT NULL,
          entry_date  DATE NOT NULL,
          qty         NUMERIC(5,2) NOT NULL,
          ref_type    VARCHAR(30) NOT NULL,
          ref_id      UUID,
          remarks     TEXT,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await ds.query(
        `CREATE INDEX IF NOT EXISTS idx_ll_employee ON leave_ledger (employee_id)`,
      );
      await ds.query(
        `CREATE INDEX IF NOT EXISTS idx_ll_client   ON leave_ledger (client_id)`,
      );
      logger.log('Schema patch: leave_ledger table OK');
    } catch (e: any) {
      logger.warn(`Schema patch leave_ledger skipped: ${e?.message}`);
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
