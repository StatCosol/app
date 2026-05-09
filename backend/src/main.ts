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

  // Secure headers — defaults plus explicit HSTS preload, no-referrer, and a
  // restrictive CSP appropriate for a JSON API (no inline scripts/styles served
  // from this origin; uploads are same-origin via /uploads with auth).
  app.use(
    helmet({
      hsts: {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"], // Swagger UI uses inline
          'img-src': ["'self'", 'data:', 'blob:'],
          'connect-src': ["'self'"],
          'object-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
        },
      },
    }),
  );

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

    try {
      await ds.query(`
        ALTER TABLE employees
          ADD COLUMN IF NOT EXISTS bulk_import_batch_id UUID DEFAULT NULL
      `);
      await ds.query(`
        CREATE INDEX IF NOT EXISTS idx_employees_bulk_import_batch_id
          ON employees(client_id, bulk_import_batch_id)
          WHERE bulk_import_batch_id IS NOT NULL
      `);
      logger.log('Schema patch: employees.bulk_import_batch_id OK');
    } catch (e: any) {
      logger.warn(
        `Schema patch employees.bulk_import_batch_id skipped: ${e?.message}`,
      );
    }

    try {
      await ds.query(`
        ALTER TABLE payroll_client_setup
          ADD COLUMN IF NOT EXISTS wage_basis_days VARCHAR(20) NOT NULL DEFAULT 'FIXED_26'
      `);
      await ds.query(`
        ALTER TABLE payroll_client_setup
          ADD COLUMN IF NOT EXISTS ot_multiplier NUMERIC(4,2) NOT NULL DEFAULT 2.0
      `);
      logger.log(
        'Schema patch: payroll_client_setup.wage_basis_days/ot_multiplier OK',
      );
    } catch (e: any) {
      logger.warn(
        `Schema patch payroll_client_setup wage/OT skipped: ${e?.message}`,
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

    // ── Accounts & Billing schema (idempotent) ──
    // Creates ENUM types and tables if they don't exist so the Accounts &
    // Billing module's API endpoints don't 500 with "relation does not exist".
    try {
      const billingStmts: string[] = [
        `DO $$ BEGIN CREATE TYPE billing_frequency AS ENUM ('ONE_TIME','MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE invoice_type AS ENUM ('PROFORMA','TAX_INVOICE','CREDIT_NOTE','DEBIT_NOTE','REIMBURSEMENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE invoice_status AS ENUM ('DRAFT','APPROVED','GENERATED','EMAILED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('UNPAID','PARTIALLY_PAID','PAID','WRITTEN_OFF'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE mail_status AS ENUM ('NOT_SENT','SENT','DELIVERED','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `DO $$ BEGIN CREATE TYPE payment_mode AS ENUM ('CASH','BANK_TRANSFER','UPI','CHEQUE','DD','NEFT','RTGS','IMPS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `CREATE TABLE IF NOT EXISTS billing_settings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id UUID NOT NULL,legal_name VARCHAR(250) NOT NULL,trade_name VARCHAR(250),gstin VARCHAR(20) NOT NULL,pan VARCHAR(20) NOT NULL,address TEXT NOT NULL,state_code VARCHAR(10) NOT NULL,state_name VARCHAR(100) NOT NULL,email VARCHAR(200),phone VARCHAR(30),bank_account_name VARCHAR(200),bank_name VARCHAR(150),account_number VARCHAR(50),ifsc_code VARCHAR(20),branch_name VARCHAR(150),invoice_prefix VARCHAR(20) DEFAULT 'STS/INV',proforma_prefix VARCHAR(20) DEFAULT 'STS/PI',credit_note_prefix VARCHAR(20) DEFAULT 'STS/CN',financial_year_format VARCHAR(30) DEFAULT 'YYYY-YY',default_gst_rate NUMERIC(5,2) DEFAULT 18,default_payment_terms_days INT DEFAULT 30,default_sac_code VARCHAR(20),authorized_signatory_name VARCHAR(150),authorized_signatory_designation VARCHAR(100),terms_and_conditions TEXT,notes_footer TEXT,updated_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS billing_clients (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id UUID NOT NULL,client_id UUID,billing_code VARCHAR(50) NOT NULL UNIQUE,legal_name VARCHAR(200) NOT NULL,trade_name VARCHAR(200),contact_person VARCHAR(150),billing_email VARCHAR(200) NOT NULL,cc_email TEXT,mobile VARCHAR(20),gst_applicable BOOLEAN DEFAULT TRUE,gstin VARCHAR(20),pan VARCHAR(20),place_of_supply VARCHAR(100),state_name VARCHAR(100) NOT NULL,state_code VARCHAR(10) NOT NULL,default_gst_rate NUMERIC(5,2) DEFAULT 18,default_sac_code VARCHAR(20),payment_terms_days INT DEFAULT 30,billing_frequency billing_frequency DEFAULT 'MONTHLY',billing_address TEXT NOT NULL,status VARCHAR(30) DEFAULT 'ACTIVE',created_at TIMESTAMP DEFAULT NOW(),updated_at TIMESTAMP DEFAULT NOW())`,
        `CREATE INDEX IF NOT EXISTS idx_billing_clients_tenant ON billing_clients(tenant_id)`,
        `CREATE INDEX IF NOT EXISTS idx_billing_clients_status ON billing_clients(status)`,
        `CREATE TABLE IF NOT EXISTS invoices (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id UUID NOT NULL,billing_client_id UUID NOT NULL REFERENCES billing_clients(id),invoice_type invoice_type NOT NULL,invoice_number VARCHAR(50) NOT NULL UNIQUE,invoice_date DATE NOT NULL,due_date DATE NOT NULL,financial_year VARCHAR(20) NOT NULL,place_of_supply VARCHAR(100),state_code VARCHAR(10),gstin VARCHAR(20),sub_total NUMERIC(14,2) DEFAULT 0,discount_total NUMERIC(14,2) DEFAULT 0,taxable_value NUMERIC(14,2) DEFAULT 0,cgst_rate NUMERIC(5,2) DEFAULT 0,cgst_amount NUMERIC(14,2) DEFAULT 0,sgst_rate NUMERIC(5,2) DEFAULT 0,sgst_amount NUMERIC(14,2) DEFAULT 0,igst_rate NUMERIC(5,2) DEFAULT 0,igst_amount NUMERIC(14,2) DEFAULT 0,total_gst NUMERIC(14,2) DEFAULT 0,round_off NUMERIC(14,2) DEFAULT 0,grand_total NUMERIC(14,2) DEFAULT 0,amount_received NUMERIC(14,2) DEFAULT 0,balance_outstanding NUMERIC(14,2) DEFAULT 0,invoice_status invoice_status DEFAULT 'DRAFT',payment_status payment_status DEFAULT 'UNPAID',mail_status mail_status DEFAULT 'NOT_SENT',remarks TEXT,pdf_path TEXT,created_by UUID NOT NULL,approved_by UUID,approved_at TIMESTAMP,created_at TIMESTAMP DEFAULT NOW(),updated_at TIMESTAMP DEFAULT NOW())`,
        `CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id)`,
        `CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(billing_client_id)`,
        `CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(invoice_status)`,
        `CREATE INDEX IF NOT EXISTS idx_invoices_payment ON invoices(payment_status)`,
        `CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date)`,
        `CREATE INDEX IF NOT EXISTS idx_invoices_fy ON invoices(financial_year)`,
        `CREATE TABLE IF NOT EXISTS invoice_items (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,service_code VARCHAR(50),service_description TEXT NOT NULL,sac_code VARCHAR(20),period_from DATE,period_to DATE,quantity NUMERIC(10,2) DEFAULT 1,rate NUMERIC(14,2) DEFAULT 0,amount NUMERIC(14,2) DEFAULT 0,discount_amount NUMERIC(14,2) DEFAULT 0,taxable_amount NUMERIC(14,2) DEFAULT 0,gst_rate NUMERIC(5,2) DEFAULT 0,gst_amount NUMERIC(14,2) DEFAULT 0,line_total NUMERIC(14,2) DEFAULT 0,is_reimbursement BOOLEAN DEFAULT FALSE,sequence INT DEFAULT 1)`,
        `CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)`,
        `CREATE TABLE IF NOT EXISTS invoice_payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,receipt_number VARCHAR(50) NOT NULL,payment_date DATE NOT NULL,amount_received NUMERIC(14,2) DEFAULT 0,tds_amount NUMERIC(14,2) DEFAULT 0,other_deduction NUMERIC(14,2) DEFAULT 0,net_received NUMERIC(14,2) DEFAULT 0,payment_mode payment_mode NOT NULL,reference_number VARCHAR(100),bank_name VARCHAR(100),remarks TEXT,created_by UUID NOT NULL,created_at TIMESTAMP DEFAULT NOW())`,
        `CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id)`,
        `CREATE TABLE IF NOT EXISTS invoice_email_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,to_email TEXT NOT NULL,cc_email TEXT,subject VARCHAR(250) NOT NULL,body TEXT,sent_status VARCHAR(30) NOT NULL DEFAULT 'NOT_SENT',sent_at TIMESTAMP,sent_by UUID,failure_reason TEXT,created_at TIMESTAMP NOT NULL DEFAULT NOW())`,
        `CREATE INDEX IF NOT EXISTS idx_email_logs_invoice ON invoice_email_logs(invoice_id)`,
        `CREATE TABLE IF NOT EXISTS recurring_invoice_configs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),billing_client_id UUID NOT NULL REFERENCES billing_clients(id),invoice_name VARCHAR(150) NOT NULL,frequency billing_frequency NOT NULL DEFAULT 'MONTHLY',service_description TEXT NOT NULL,default_amount NUMERIC(14,2) NOT NULL,default_gst_rate NUMERIC(5,2) DEFAULT 18,start_date DATE NOT NULL,end_date DATE,next_run_date DATE NOT NULL,is_active BOOLEAN DEFAULT TRUE,created_by UUID NOT NULL,created_at TIMESTAMP DEFAULT NOW(),updated_at TIMESTAMP DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS invoice_audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,action VARCHAR(50) NOT NULL,old_status VARCHAR(30),new_status VARCHAR(30),changed_by UUID,payload JSONB,changed_at TIMESTAMP NOT NULL DEFAULT NOW())`,
        `CREATE INDEX IF NOT EXISTS idx_audit_logs_invoice ON invoice_audit_logs(invoice_id)`,
        `INSERT INTO billing_settings (tenant_id,legal_name,trade_name,gstin,pan,address,state_code,state_name,email,phone,bank_account_name,bank_name,account_number,ifsc_code,branch_name,invoice_prefix,proforma_prefix,credit_note_prefix,default_gst_rate,default_payment_terms_days,authorized_signatory_name,authorized_signatory_designation,terms_and_conditions) SELECT '00000000-0000-0000-0000-000000000000','StatCo Solutions','StatCo Solutions','36LNIPK6065M1Z6','LNIPK6065M','D.No 8-3-228/595/3, Rehamat Nagar, Yusufguda, Hyderabad, Telangana - 500045','36','Telangana','Compliance@statcosol.com','+91 9000607839','Kallepalli Lakshmana Kumar','State Bank of India','44043172246','SBIN0014267','Dolapeta','STS/INV','STS/PI','STS/CN',18,30,'Kallepalli Lakshmana Kumar','Proprietor','We declare that this invoice shows the actual price of the services provided and that all particulars are true and correct.' WHERE NOT EXISTS (SELECT 1 FROM billing_settings LIMIT 1)`,
        `UPDATE billing_settings SET branch_name='Dolapeta' WHERE branch_name IS NULL OR branch_name='' OR branch_name='Yusufguda'`,
        `ALTER TABLE invoices ALTER COLUMN due_date DROP NOT NULL`,
      ];
      for (const s of billingStmts) {
        try {
          await ds.query(s);
        } catch (e: any) {
          logger.warn(`Billing schema stmt skipped: ${e?.message}`);
        }
      }
      logger.log('Schema patch: accounts & billing tables OK');
    } catch (e: any) {
      logger.warn(`Schema patch accounts & billing skipped: ${e?.message}`);
    }

    // ── Client department contacts (idempotent) ──
    // Used by admin UI to maintain per-client department mailing lists
    // (ACCOUNTS, COMPLIANCE, CONTRACTOR_COMPLIANCE, HR, PAYROLL) and by
    // monthly cron jobs (1st = payroll input request, 16th = MCD request).
    try {
      const cdcStmts: string[] = [
        `DO $$ BEGIN CREATE TYPE client_contact_department AS ENUM ('ACCOUNTS','COMPLIANCE','CONTRACTOR_COMPLIANCE','HR','PAYROLL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
        `CREATE TABLE IF NOT EXISTS client_department_contacts (
           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
           department client_contact_department NOT NULL,
           name VARCHAR(160) NOT NULL,
           email VARCHAR(160) NOT NULL,
           phone VARCHAR(40),
           designation VARCHAR(120),
           is_active BOOLEAN NOT NULL DEFAULT TRUE,
           notes TEXT,
           created_by UUID,
           updated_by UUID,
           created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
         )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_cdc_client_dept_email ON client_department_contacts (client_id, department, lower(email))`,
        `CREATE INDEX IF NOT EXISTS idx_cdc_client_dept_active ON client_department_contacts (client_id, department) WHERE is_active = TRUE`,
        `CREATE INDEX IF NOT EXISTS idx_cdc_dept_active ON client_department_contacts (department) WHERE is_active = TRUE`,
        `CREATE TABLE IF NOT EXISTS client_monthly_comm_runs (
           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
           comm_type VARCHAR(40) NOT NULL,
           run_month DATE NOT NULL,
           recipients TEXT NOT NULL,
           cc_emails TEXT,
           status VARCHAR(20) NOT NULL,
           failure_reason TEXT,
           triggered_by VARCHAR(40) NOT NULL DEFAULT 'CRON',
           sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
         )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_cmcr_client_type_month ON client_monthly_comm_runs (client_id, comm_type, run_month)`,
        `CREATE TABLE IF NOT EXISTS client_comm_templates (
           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           comm_type VARCHAR(40) NOT NULL UNIQUE,
           subject_template TEXT NOT NULL,
           body_template TEXT NOT NULL,
           updated_by UUID,
           updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
         )`,
      ];
      for (const s of cdcStmts) {
        try {
          await ds.query(s);
        } catch (e: any) {
          logger.warn(`client_department_contacts stmt skipped: ${e?.message}`);
        }
      }
      logger.log('Schema patch: client_department_contacts OK');
    } catch (e: any) {
      logger.warn(
        `Schema patch client_department_contacts skipped: ${e?.message}`,
      );
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

  // ── Production env-var validation (fail-fast) ───────────────
  if (isProd) {
    if (!config.get<string>('JWT_SECRET')) {
      logger.error('✗ JWT_SECRET is required in production');
      throw new Error('JWT_SECRET is required in production');
    }
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

// Surface bootstrap failures to stderr so CI/Docker logs capture them even
// when bufferLogs:true is enabled and the pino logger never gets wired up.
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[Bootstrap] FATAL:', err && (err.stack || err.message || err));
  process.exit(1);
});

// Catch silent killers: unhandled promise rejections and uncaught exceptions
// that occur during early bootstrap before Nest's logger is ready.
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[uncaughtException]', err && (err.stack || err.message || err));
});
