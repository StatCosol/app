import { envValidationSchema } from './env.validation';

const baseEnv = {
  NODE_ENV: 'development',
  DB_HOST: 'localhost',
  DB_PORT: 5432,
  DB_USER: 'postgres',
  DB_PASS: '',
  DB_NAME: 'statco',
  JWT_SECRET: '12345678901234567890',
};

describe('envValidationSchema', () => {
  it('allows development mode without AI_ENCRYPTION_KEY', () => {
    const { error } = envValidationSchema.validate(baseEnv, {
      abortEarly: false,
    });

    expect(error).toBeUndefined();
  });

  it('requires AI_ENCRYPTION_KEY in production', () => {
    const { error } = envValidationSchema.validate(
      {
        ...baseEnv,
        NODE_ENV: 'production',
      },
      { abortEarly: false },
    );

    expect(error?.message).toContain('"AI_ENCRYPTION_KEY" is required');
  });

  it('requires SMTP settings when email is enabled', () => {
    const { error } = envValidationSchema.validate(
      {
        ...baseEnv,
        EMAIL_ENABLED: 'true',
      },
      { abortEarly: false },
    );

    expect(error?.message).toContain('"SMTP_HOST" is required');
    expect(error?.message).toContain('"SMTP_PORT" is required');
    expect(error?.message).toContain('"SMTP_USER" is required');
    expect(error?.message).toContain('"SMTP_PASS" is required');
    expect(error?.message).toContain('"SMTP_FROM_EMAIL" is required');
  });

  it('accepts enabled email when SMTP settings are present', () => {
    const { error, value } = envValidationSchema.validate(
      {
        ...baseEnv,
        EMAIL_ENABLED: 'true',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: 587,
        SMTP_USER: 'user',
        SMTP_PASS: 'pass',
        SMTP_FROM_EMAIL: 'noreply@example.com',
      },
      { abortEarly: false },
    );

    expect(error).toBeUndefined();
    expect(value.SCHEDULE_TIMEZONE).toBe('Asia/Kolkata');
  });
});
