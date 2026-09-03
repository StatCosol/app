import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Vitest-native specs executed in CI via `npm run test:unit`.
    // Angular TestBed specs continue to use `ng test`.
    include: [
      'src/app/modules/accounts-billing/**/*.spec.ts',
      'src/app/shared/**/*.spec.ts',
      'src/app/core/**/*.spec.ts',
      'src/app/pages/**/*.spec.ts',
    ],
    browser: {
      api: {
        host: '127.0.0.1',
        port: 51204,
      },
    },
  },
});
