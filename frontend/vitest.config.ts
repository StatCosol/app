import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Vitest-native specs executed in CI via `npm run test:unit`.
    // Angular TestBed uses vitest.angular.config.ts and CLI test discovery.
    include: [
      'src/app/core/session-isolation.spec.ts',
      'src/app/pages/crm/compliance/crm-reupload-backlog.component.spec.ts',
      'src/app/pages/branch/branch-reports/branch-reports.component.spec.ts',
      // Billing component TestBed specs run through ng test, not the Node runner.
      'src/app/modules/accounts-billing/services/**/*.spec.ts',
      // Pure/logic specs (utils, validators, pipes) — no Angular TestBed needed.
      'src/app/shared/**/*.spec.ts',
    ],
  },
});
