import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Vitest-native specs executed in CI via `npm run test:unit`.
    // Angular TestBed specs continue to use `ng test`.
    include: [
      'src/app/core/session-isolation.spec.ts',
      'src/app/pages/crm/compliance/crm-reupload-backlog.component.spec.ts',
      'src/app/pages/branch/branch-reports/branch-reports.component.spec.ts',
      'src/app/modules/accounts-billing/**/*.spec.ts',
      // Pure/logic specs (utils, validators, pipes) — no Angular TestBed needed.
      'src/app/shared/**/*.spec.ts',
    ],
    browser: {
      api: {
        host: '127.0.0.1',
        port: 51204,
      },
    },
  },
});
