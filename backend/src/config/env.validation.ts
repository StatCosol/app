import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(3000),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASS: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),

  JWT_SECRET: Joi.string().min(20).required(),
  // Access-token lifetime in seconds (default 15 min); refresh token is 30 days (hardcoded in auth.service)
  JWT_ACCESS_EXPIRES_SEC: Joi.number().default(900),

  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().optional(),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  SMTP_FROM: Joi.string().optional(),
  SMTP_SECURE: Joi.string().valid('true', 'false').optional().default('false'),
  SMTP_FROM_NAME: Joi.string().optional().default('StatCo Solutions'),
  SMTP_FROM_EMAIL: Joi.string().email().optional(),

  FRONTEND_URL: Joi.string().uri().optional().default('http://localhost:4200'),
  CORS_ORIGINS: Joi.string().optional(),
  EMAIL_ENABLED: Joi.string()
    .valid('true', 'false')
    .optional()
    .default('false'),
  ADMIN_ALERT_EMAILS: Joi.string().optional(),
  DEFAULT_SEED_PASSWORD: Joi.string().optional(),

  // AI – hex key for AES-256 encryption (64 hex chars)
  AI_ENCRYPTION_KEY: Joi.string().hex().length(64).optional(),
});
