import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import * as bodyParser from 'body-parser';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { UsersService } from './users/users.service';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

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

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Standard response wrapper
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Secure headers
  app.use(helmet());

  // Response compression
  app.use(compression());

  // Swagger / OpenAPI documentation (disabled in production)
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('StatComPy API')
      .setDescription('Compliance Management Platform — REST API documentation')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT',
      )
      .addServer(`http://localhost:${process.env.PORT || 3000}`, 'Local dev')
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
  const isProd = process.env.NODE_ENV === 'production';
  const prodAllowedOrigins = (
    process.env.CORS_ORIGINS || 'https://statcosol.com'
  )
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

  // Serve uploaded files behind JWT authentication.
  // Previously: app.useStaticAssets('uploads/') — unauthenticated (SECURITY FIX)
  const jwtService = app.get(JwtService);
  app.use('/uploads', (req: any, res: any, next: any) => {
    // Logos are non-sensitive branding assets — serve publicly
    if (req.path.startsWith('/logos/')) {
      return next();
    }

    // Extract token from: Authorization header, or ?token= query param (for <img> / <a> tags)
    let token = '';
    const authHeader = req.headers?.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.query?.token) {
      token = req.query.token;
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
  if (process.env.SKIP_BOOTSTRAP_SEED === 'true') {
    logger.warn('Skipping bootstrap seed due to SKIP_BOOTSTRAP_SEED=true');
  } else {
    await usersService.seedRolesIfEmpty();
    await usersService.seedAdminIfMissing();
  }

  // Quick DB sanity: show current database and schema (dev only)
  if (process.env.NODE_ENV !== 'production') {
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
  }

  const port = Number(process.env.PORT || 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Server running on http://0.0.0.0:${port}`);
}
void bootstrap();
