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

  SMTP_HOST: Joi.string().when('EMAIL_ENABLED', {
    is: 'true',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  SMTP_PORT: Joi.number().when('EMAIL_ENABLED', {
    is: 'true',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  SMTP_USER: Joi.string().when('EMAIL_ENABLED', {
    is: 'true',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  SMTP_PASS: Joi.string().when('EMAIL_ENABLED', {
    is: 'true',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  SMTP_FROM: Joi.string().optional(),
  SMTP_SECURE: Joi.string().valid('true', 'false').optional().default('false'),
  SMTP_FROM_NAME: Joi.string().optional().default('StatCo Solutions'),
  SMTP_FROM_EMAIL: Joi.string().email().when('EMAIL_ENABLED', {
    is: 'true',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  FRONTEND_URL: Joi.string().uri().optional().default('http://localhost:4200'),
  CORS_ORIGINS: Joi.string().optional(),
  EMAIL_ENABLED: Joi.string()
    .valid('true', 'false')
    .optional()
    .default('false'),
  ADMIN_ALERT_EMAILS: Joi.string().optional(),
  DEFAULT_SEED_PASSWORD: Joi.string().optional(),

  // AI – hex key for AES-256 encryption (64 hex chars); required in production
  AI_ENCRYPTION_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  SCHEDULE_TIMEZONE: Joi.string().optional().default('Asia/Kolkata'),

  // face-svc microservice
  FACE_SVC_URL: Joi.string().uri().optional().allow(''),
  FACE_SVC_TIMEOUT_MS: Joi.number().optional(),
  FACE_SVC_API_KEY: Joi.string().when('FACE_SVC_URL', {
    is: Joi.string().uri().required(),
    then: Joi.string().min(16).required(),
    otherwise: Joi.optional().allow(''),
  }),

  // Phase 4c hardening — face capture
  FACE_PUNCH_REQUIRE_PROBE: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .optional()
    .default(true),
  FACE_MIN_MATCH_SCORE: Joi.number().min(0).max(1).optional(),
  FACE_SINGLE_GALLERY_MIN_MATCH_SCORE: Joi.number().min(0).max(1).optional(),
  FACE_MIN_MATCH_MARGIN: Joi.number().min(0).max(1).optional(),
  FACE_PUNCH_PHOTO_RETENTION_DAYS: Joi.number().integer().min(1).optional(),
  FACE_ENROLL_PHOTO_RETENTION_DAYS: Joi.number().integer().min(1).optional(),

  // Phase 4c hardening — real-time rejection alerts (roadmap #16)
  FACE_REJECTION_ALERT_WINDOW_MIN: Joi.number().integer().min(1).optional(),
  FACE_REJECTION_ALERT_THRESHOLD: Joi.number().integer().min(1).optional(),
  FACE_DEVICE_REJECTION_ALERT_THRESHOLD: Joi.number()
    .integer()
    .min(1)
    .optional(),
  // K9 — kiosk side-panel dashboard
  FACE_DASHBOARD_LATE_CUTOFF_HHMM: Joi.string()
    .pattern(/^\d{1,2}:\d{2}$/)
    .optional(),
  // Roadmap #14 — appearance-drift detection
  FACE_DRIFT_WINDOW_DAYS: Joi.number().integer().min(1).optional(),
  FACE_DRIFT_MIN_SAMPLES: Joi.number().integer().min(1).optional(),
  FACE_DRIFT_THRESHOLD: Joi.number().min(0).max(1).optional(),
  FACE_DRIFT_REALERT_DAYS: Joi.number().integer().min(1).optional(),
  FACE_DRIFT_REALERT_DELTA: Joi.number().min(0).max(1).optional(),
  // Roadmap #11 / K11 — PAD anti-spoof provider selection
  FACE_ANTISPOOF_PROVIDER: Joi.string()
    .valid('none', 'azure', 'facetec')
    .optional(),
  // Roadmap #7 / K10 — shift validation enforcement mode
  SHIFT_VALIDATION_MODE: Joi.string()
    .valid('off', 'warn', 'enforce')
    .optional(),
  // Roadmap #9 / K13 — mask / PPE detector + policy
  FACE_MASK_DETECTOR: Joi.string().valid('none', 'onnx', 'azure').optional(),
  FACE_MASK_POLICY: Joi.string().valid('allow', 'warn', 'block').optional(),
});
