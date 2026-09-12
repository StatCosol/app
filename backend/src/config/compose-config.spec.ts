import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { envValidationSchema } from './env.validation';

describe('production Compose environment contract', () => {
  it('provides every required backend setting using isolated test secrets', () => {
    const yaml = require('js-yaml');
    const compose = yaml.load(
      readFileSync(join(__dirname, '../../../docker-compose.yml'), 'utf8'),
    );
    const secrets: Record<string, string> = {
      DB_PASS: 'test-only',
      JWT_SECRET: 'test-only-secret-longer-than-twenty',
      AI_ENCRYPTION_KEY: 'ab'.repeat(32),
    };
    const environment = Object.fromEntries(
      Object.entries(compose.services.backend.environment).map(([key, raw]) => {
        const value = String(raw).replace(
          /\$\{(\w+):([?-])([^}]*)\}/g,
          (_m, name: string, mode: string, fallback: string) => {
            if (secrets[name]) return secrets[name];
            if (mode === '-') return fallback;
            throw new Error(`Required test secret missing: ${name}`);
          },
        );
        return [key, value];
      }),
    );
    expect(
      envValidationSchema.validate(environment, { allowUnknown: true }).error,
    ).toBeUndefined();
  });
});
