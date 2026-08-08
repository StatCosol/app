import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/app/modules/accounts-billing/**/*.spec.ts'],
    browser: {
      api: {
        host: '127.0.0.1',
        port: 51204,
      },
    },
  },
});
